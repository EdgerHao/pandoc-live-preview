/* main.js - Pandoc Live Preview Plugin (v1.6.1: Equation Cross-references) */
const { Plugin, EditorSuggest, requestUrl, Notice, PluginSettingTab, Setting, FileSystemAdapter } = require('obsidian');
const { StateField } = require('@codemirror/state');
const { Decoration, EditorView, WidgetType } = require('@codemirror/view');
const path = require('path'); // 引入 path 模块处理路径

// === 默认设置 ===
const DEFAULT_SETTINGS = {
    picgoUrl: "http://127.0.0.1:36677/upload",
    autoUpload: true,
    deleteLocal: true,
    figPrefix: "图",
    tblPrefix: "表",
    eqPrefix: "式"
};

// === 辅助函数：生成时间戳 ===
function getTimestamp() {
    const now = new Date();
    const year = now.getFullYear();
    const month = (now.getMonth() + 1).toString().padStart(2, '0');
    const day = now.getDate().toString().padStart(2, '0');
    const hour = now.getHours().toString().padStart(2, '0');
    const minute = now.getMinutes().toString().padStart(2, '0');
    const second = now.getSeconds().toString().padStart(2, '0');
    return `${year}${month}${day}${hour}${minute}${second}`;
}

// === 1. 定义组件 Widget ===
class LabelWidget extends WidgetType {
    constructor(text, type, isDef) {
        super();
        this.text = text;
        this.type = type;   
        this.isDef = isDef; 
    }

    toDOM(view) {
        const span = document.createElement("span");
        span.innerText = this.text;
        span.className = `pandoc-widget pandoc-${this.type} pandoc-${this.isDef ? 'def' : 'ref'}`;
        return span;
    }

    eq(other) {
        return other.text === this.text && other.type === this.type && other.isDef === this.isDef;
    }
}

// === 2. 建立索引逻辑 ===
let currentSettings = Object.assign({}, DEFAULT_SETTINGS);
// 设置（前缀）变更时递增：已打开的编辑器在下一个事务里检测到 epoch 不一致即重新扫描
let settingsEpoch = 0;
// 按 Doc 缓存扫描结果：Doc 不可变（编辑即生成新 Doc，自然失效），
// 编辑器关闭后缓存随 Doc 一起被 GC 回收，无需手动清理
const scanCache = new WeakMap();

// 标签正则（定义 + 引用合一，全插件共用一份）：
// - 定义：{#fig:xxx 标题} / {#tbl:xxx 标题} / {#eq:xxx 标题}
//   标题部分用「前瞻捕获 + 反向引用」模拟原子组：(?:\s+[^\n{}]*) 只尝试一次、不回溯，
//   修复旧写法 (?:\s+.*?)? 在「未闭合 id + 长空白行」上的二次方回溯
// - 引用：@fig:xxx / @tbl:xxx / @eq:xxx（前后紧邻的空格一并纳入替换范围，保持旧行为）
const LABEL_REGEX = /\{#(?<dType>fig|tbl|eq):(?<dId>[a-zA-Z0-9_\-]+)(?=(?<cap>(?:\s+[^\n{}]*)?))\k<cap>\}|(?<ref> ?@(?<rType>fig|tbl|eq):(?<rId>[a-zA-Z0-9_\-]+) ?)/g;

// 各类型标签的显示前缀
function prefixOf(type) {
    if (type === 'fig') return currentSettings.figPrefix;
    if (type === 'tbl') return currentSettings.tblPrefix;
    return currentSettings.eqPrefix;
}

// 单次遍历同时产出：
// - defs:  定义列表（供自动补全使用，结构与旧版一致）
// - labels: 所有标签的位置与编号（供装饰器使用）
function scanLabels(text) {
    const defs = [];
    const hits = [];
    let figCount = 0;
    let tblCount = 0;
    let eqCount = 0;

    LABEL_REGEX.lastIndex = 0;
    let match;
    while ((match = LABEL_REGEX.exec(text)) !== null) {
        const g = match.groups;
        const isDef = g.dId !== undefined;
        if (isDef) {
            const number = g.dType === 'fig' ? ++figCount : g.dType === 'tbl' ? ++tblCount : ++eqCount;
            defs.push({
                id: g.dId,
                type: g.dType,
                label: `${prefixOf(g.dType)}${number}`,
                fullId: `${g.dType}:${g.dId}`
            });
        }
        hits.push({
            from: match.index,
            to: match.index + match[0].length,
            type: isDef ? g.dType : g.rType,
            id: isDef ? g.dId : g.rId,
            isDef: isDef
        });
    }

    // 编号解析（与旧实现一致）：同一 id 的多个定义取最后一个的编号；未定义的引用显示 "?"
    const numbers = new Map();
    for (const def of defs) {
        numbers.set(def.fullId, def.label.slice(prefixOf(def.type).length));
    }

    const labels = hits.map(hit => ({
        ...hit,
        number: numbers.has(`${hit.type}:${hit.id}`) ? numbers.get(`${hit.type}:${hit.id}`) : "?"
    }));

    return { defs, labels };
}

// 按 Doc 复用扫描结果：编辑生成新 Doc 自动 miss；重复触发、多窗格共享同一 Doc 时命中
function getScan(doc) {
    const cached = scanCache.get(doc);
    if (cached && cached.epoch === settingsEpoch) return cached;
    const result = scanLabels(doc.toString());
    result.epoch = settingsEpoch;
    scanCache.set(doc, result);
    return result;
}

// === 3. 核心装饰器 ===
let isSourceMode = false; // 源码模式下不渲染 widget

// 缓存状态（标签列表 + 渲染结果）存放在 StateField 自身的值里：
// 每个编辑器独立一份，互不串用；编辑器关闭后随状态一起回收
function buildDecorations(labels, selectionRanges) {
    const widgets = [];
    for (const lb of labels) {
        let suppressed = false;
        for (const range of selectionRanges) {
            if (range.from <= lb.to && range.to >= lb.from) { suppressed = true; break; }
        }
        if (suppressed) continue; // 光标位于标签上：显示原始源码

        widgets.push(Decoration.replace({
            widget: new LabelWidget(`${prefixOf(lb.type)}${lb.number}`, lb.type, lb.isDef),
            inclusive: false
        }).range(lb.from, lb.to));
    }
    // labels 按文档顺序生成，天然有序
    return Decoration.set(widgets, true);
}

const pandocRefField = StateField.define({
    create(state) {
        // 打开文档时立即渲染（源码模式下暂不显示，索引仍建立，切回实时预览即可恢复）
        const { labels } = getScan(state.doc);
        return {
            epoch: settingsEpoch,
            sourceMode: isSourceMode,
            labels,
            decorations: isSourceMode ? Decoration.none : buildDecorations(labels, state.selection.ranges)
        };
    },
    update(value, transaction) {
        // 文档变化，或设置（前缀）刚被修改（epoch 不一致）→ 重新扫描
        if (transaction.docChanged || value.epoch !== settingsEpoch) {
            const { labels } = getScan(transaction.state.doc);
            return {
                epoch: settingsEpoch,
                sourceMode: isSourceMode,
                labels,
                decorations: isSourceMode ? Decoration.none : buildDecorations(labels, transaction.state.selection.ranges)
            };
        }
        // 模式切换、纯光标/选择变化：不重扫全文，用已有标签廉价重建（处理移入/移出标签的显隐切换）
        if (value.sourceMode !== isSourceMode || transaction.selection) {
            return {
                epoch: value.epoch,
                sourceMode: isSourceMode,
                labels: value.labels,
                decorations: isSourceMode ? Decoration.none : buildDecorations(value.labels, transaction.state.selection.ranges)
            };
        }
        return value;
    },
    provide: (field) => EditorView.decorations.from(field, (v) => v.decorations)
});

// === 4. 自动补全建议类 ===
class PandocSuggest extends EditorSuggest {
    constructor(plugin) {
        super(plugin.app);
        this.plugin = plugin;
    }

    onTrigger(cursor, editor, file) {
        const line = editor.getLine(cursor.line);
        const sub = line.substring(0, cursor.ch);
        const match = sub.match(/(@(fig|tbl|eq)?:?([a-zA-Z0-9_\-]*))$/);
        if (match) {
            return {
                start: { line: cursor.line, ch: match.index },
                end: cursor,
                query: match[0]
            };
        }
        return null;
    }

    getSuggestions(context) {
        const editor = context.editor;
        let defs;
        // 复用按 Doc 的共享扫描缓存（与装饰器共用），避免对同一文档重复全文扫描
        if (editor.cm && editor.cm.state && editor.cm.state.doc) {
            defs = getScan(editor.cm.state.doc).defs;
        } else {
            defs = scanLabels(editor.getValue()).defs;
        }

        const query = context.query.toLowerCase();

        return defs.filter(def => {
            const suggestion = `@${def.type}:${def.id}`;
            return suggestion.toLowerCase().includes(query);
        }).map(def => ({
            ...def,
            suggestionText: `@${def.type}:${def.id}`
        }));
    }

    renderSuggestion(suggestion, el) {
        el.createEl("span", { text: suggestion.label, cls: "pandoc-suggest-label" }); 
        el.createEl("small", { text: ` (${suggestion.id})`, cls: "pandoc-suggest-id" });
    }

    selectSuggestion(suggestion, event) {
        const context = this.context;
        if (!context) return;
        context.editor.replaceRange(suggestion.suggestionText, context.start, context.end);
    }
}

// === 5. 设置面板 ===
class PandocLivePreviewSettingTab extends PluginSettingTab {
    constructor(app, plugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display() {
        const { containerEl } = this;
        containerEl.empty();
        containerEl.createEl('h2', { text: 'Pandoc Live Preview 设置' });

        new Setting(containerEl)
            .setName('PicGo 上传接口')
            .setDesc('默认: http://127.0.0.1:36677/upload')
            .addText(text => text
                .setPlaceholder('http://127.0.0.1:36677/upload')
                .setValue(this.plugin.settings.picgoUrl)
                .onChange(async (value) => {
                    this.plugin.settings.picgoUrl = value;
                    await this.plugin.saveSettings();
                }));

        new Setting(containerEl)
            .setName('剪切板自动上传')
            .setDesc('粘贴图片时，自动上传到 PicGo。')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.autoUpload)
                .onChange(async (value) => {
                    this.plugin.settings.autoUpload = value;
                    await this.plugin.saveSettings();
                }));
        
        new Setting(containerEl)
            .setName('上传后移除本地文件')
            .setDesc('开启：上传成功后删除本地临时文件。关闭：保留本地备份。')
            .addToggle(toggle => toggle
                .setValue(this.plugin.settings.deleteLocal)
                .onChange(async (value) => {
                    this.plugin.settings.deleteLocal = value;
                    await this.plugin.saveSettings();
                }));

        containerEl.createEl('h3', { text: '前缀显示设置' });
        new Setting(containerEl).setName('图片前缀').addText(text => text.setValue(this.plugin.settings.figPrefix).onChange(async (value) => {
            this.plugin.settings.figPrefix = value; await this.plugin.saveSettings(); this.plugin.refreshEditors();
        }));
        new Setting(containerEl).setName('表格前缀').addText(text => text.setValue(this.plugin.settings.tblPrefix).onChange(async (value) => {
            this.plugin.settings.tblPrefix = value; await this.plugin.saveSettings(); this.plugin.refreshEditors();
        }));
        new Setting(containerEl).setName('公式前缀').addText(text => text.setValue(this.plugin.settings.eqPrefix).onChange(async (value) => {
            this.plugin.settings.eqPrefix = value; await this.plugin.saveSettings(); this.plugin.refreshEditors();
        }));
    }
}

// === 6. 插件主类 (修复上传逻辑) ===
module.exports = class PandocLivePreview extends Plugin {
    async onload() {
        await this.loadSettings();
        currentSettings = this.settings;
        this.registerEditorExtension(pandocRefField);
        this.registerEditorSuggest(new PandocSuggest(this));
        this.addSettingTab(new PandocLivePreviewSettingTab(this.app, this));
        
        this.registerEvent(this.app.workspace.on('layout-ready', () => {
            this.updateSourceModeStatus();
        }));
        this.registerEvent(this.app.workspace.on('active-leaf-change', (leaf) => {
            this.updateSourceModeStatus();
        }));
        
        this.addCommand({
            id: 'insert-fig-id-timestamp',
            name: '插入图片ID (Insert Figure ID)',
            editorCallback: (editor) => {
                editor.replaceSelection(`{#fig:${getTimestamp()}}`);
            }
        });
        this.addCommand({
            id: 'insert-tbl-id-timestamp',
            name: '插入表格ID (Insert Table ID)',
            editorCallback: (editor) => {
                editor.replaceSelection(`{#tbl:${getTimestamp()}}`);
            }
        });
        this.addCommand({
            id: 'insert-eq-id-timestamp',
            name: '插入公式ID (Insert Equation ID)',
            editorCallback: (editor) => {
                editor.replaceSelection(`{#eq:${getTimestamp()}}`);
            }
        });
        this.registerEvent(this.app.workspace.on('editor-paste', this.handleImagePaste.bind(this)));
    }

    async loadSettings() { this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData()); }
    async saveSettings() { await this.saveData(this.settings); }

    // 把空事务派发给所有已打开的编辑器，触发装饰字段立即重算；
    // 若运行环境不支持 iterateCodeMirrors，则等下一次任意事务再生效
    dispatchToAllEditors() {
        if (typeof this.app.workspace.iterateCodeMirrors === 'function') {
            this.app.workspace.iterateCodeMirrors((cm) => {
                if (cm && typeof cm.dispatch === 'function') cm.dispatch({});
            });
        }
    }

    // 设置（前缀）变更后：递增 epoch，并让所有编辑器立即重扫
    refreshEditors() {
        settingsEpoch++;
        this.dispatchToAllEditors();
    }

    updateSourceModeStatus() {
        const activeLeaf = this.app.workspace.activeLeaf;
        const mode = activeLeaf && activeLeaf.view ? activeLeaf.view.getMode() : null;
        const next = (mode === 'source');
        if (next !== isSourceMode) {
            isSourceMode = next;
            this.dispatchToAllEditors(); // 模式切换立即生效，不再等待下一次编辑
        }
    }

    // === PicGo 上传逻辑 (文件路径版) ===
    async handleImagePaste(evt, editor, view) {
        if (!this.settings.autoUpload) return;

        if (evt.clipboardData.files.length > 0) {
            const file = evt.clipboardData.files[0];
            
            if (file.type.startsWith('image/')) {
                evt.preventDefault();
                evt.stopPropagation();
                
                const timestamp = getTimestamp();
                const placeholder = `![Uploading...](${timestamp})`;
                editor.replaceSelection(placeholder);
                
                try {
                    // 1. 先将文件保存到 Vault 本地 (作为临时文件)
                    const arrayBuffer = await file.arrayBuffer();
                    const extension = file.type.split('/')[1] || 'png';
                    const fileName = `Image_${timestamp}.${extension}`;
                    
                    // 获取 Obsidian 推荐的保存路径 (例如附件文件夹下)
                    const filePath = await this.app.fileManager.getAvailablePathForAttachment(fileName);
                    await this.app.vault.createBinary(filePath, arrayBuffer);

                    // 2. 获取该文件的绝对路径 (Absolute Path)
                    // PicGo 需要绝对路径才能读取
                    let absolutePath;
                    if (this.app.vault.adapter instanceof FileSystemAdapter) {
                        const basePath = this.app.vault.adapter.getBasePath();
                        absolutePath = path.join(basePath, filePath);
                    } else {
                        // 移动端或其他特殊情况不支持 PicGo Server
                        new Notice("PicGo 上传仅支持桌面版");
                        return;
                    }

                    // 3. 发送路径给 PicGo
                    const response = await requestUrl({
                        url: this.settings.picgoUrl,
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ list: [absolutePath] })
                    });

                    const resData = response.json;

                    if (resData.success && resData.result && resData.result.length > 0) {
                        const remoteUrl = resData.result[0];
                        const finalStr = `![](${remoteUrl}){#fig:${timestamp}}`;
                        
                        // 4. 替换占位符
                        const doc = editor.getValue();
                        if (doc.includes(placeholder)) {
                            editor.setValue(doc.replace(placeholder, finalStr));
                            new Notice(`图片上传成功!`);
                        } else {
                            editor.replaceSelection(finalStr); // 兜底
                        }

                        // 5. 根据设置决定是否删除本地文件
                        if (this.settings.deleteLocal) {
                            const fileToDelete = this.app.vault.getAbstractFileByPath(filePath);
                            if (fileToDelete) {
                                await this.app.vault.delete(fileToDelete);
                            }
                        }
                    } else {
                        new Notice("PicGo 上传失败");
                        editor.setValue(editor.getValue().replace(placeholder, ""));
                    }
                    
                } catch (error) {
                    console.error("Upload Error:", error);
                    new Notice(`上传出错: ${error.message}`);
                    editor.setValue(editor.getValue().replace(placeholder, ""));
                }
            }
        }
    }
};
