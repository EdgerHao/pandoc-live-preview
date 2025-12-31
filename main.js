/* main.js - Pandoc Live Preview Plugin (v1.5.0: Stable PicGo Upload) */
const { Plugin, EditorSuggest, requestUrl, Notice, PluginSettingTab, Setting, FileSystemAdapter } = require('obsidian');
const { StateField, EditorState } = require('@codemirror/state');
const { Decoration, EditorView, WidgetType } = require('@codemirror/view');
const path = require('path'); // 引入 path 模块处理路径

// === 默认设置 ===
const DEFAULT_SETTINGS = {
    picgoUrl: "http://127.0.0.1:36677/upload",
    autoUpload: true,
    deleteLocal: true,
    figPrefix: "图",
    tblPrefix: "表"
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
}

// === 2. 建立索引逻辑 ===
let currentSettings = Object.assign({}, DEFAULT_SETTINGS);

function scanDefinitions(text, settings) {
    const definitions = [];
    let figCount = 0;
    let tblCount = 0;
    
    const FIG_PRE = settings.figPrefix;
    const TBL_PRE = settings.tblPrefix;

    const regex = /\{#(fig|tbl):([a-zA-Z0-9_\-]+)(?:\s+.*?)?\}/g;
    let match;

    while ((match = regex.exec(text)) !== null) {
        const type = match[1];
        const id = match[2];
        let label = "";

        if (type === 'fig') {
            figCount++;
            label = `${FIG_PRE}${figCount}`;
        } else if (type === 'tbl') {
            tblCount++;
            label = `${TBL_PRE}${tblCount}`;
        }

        definitions.push({
            id: id,
            type: type,
            label: label,
            fullId: `${type}:${id}`
        });
    }
    return definitions;
}

// === 3. 核心装饰器 ===
const pandocRefField = StateField.define({
    create(state) {
        return Decoration.none;
    },
    update(oldDecorations, transaction) {
        if (!transaction.docChanged && !transaction.selection) return oldDecorations;

        const state = transaction.state;
        const text = state.doc.toString();
        const widgets = [];
        const selectionRanges = state.selection.ranges;

        const defs = scanDefinitions(text, currentSettings);
        const figMap = new Map();
        const tblMap = new Map();
        
        const FIG_PRE = currentSettings.figPrefix;
        const TBL_PRE = currentSettings.tblPrefix;
        
        defs.forEach(def => {
            if (def.type === 'fig') figMap.set(def.id, def.label.replace(FIG_PRE, ''));
            if (def.type === 'tbl') tblMap.set(def.id, def.label.replace(TBL_PRE, ''));
        });

        function checkCursorOverlap(start, end) {
            for (const range of selectionRanges) {
                if (range.from <= end && range.to >= start) return true;
            }
            return false;
        }

        function addDecoration(start, end, type, id, isDef) {
            if (checkCursorOverlap(start, end)) return;

            let number = "?";
            let prefix = "";

            if (type === 'fig') {
                prefix = FIG_PRE;
                if (figMap.has(id)) number = figMap.get(id);
            } else if (type === 'tbl') {
                prefix = TBL_PRE;
                if (tblMap.has(id)) number = tblMap.get(id);
            }

            const displayText = `${prefix}${number}`;
            const deco = Decoration.replace({
                widget: new LabelWidget(displayText, type, isDef),
                inclusive: false
            }).range(start, end);
            widgets.push(deco);
        }

        const defRegex = /\{#(fig|tbl):([a-zA-Z0-9_\-]+)(?:\s+.*?)?\}/g;
        let defMatch;
        while ((defMatch = defRegex.exec(text)) !== null) {
            addDecoration(defMatch.index, defMatch.index + defMatch[0].length, defMatch[1], defMatch[2], true);
        }

        const refRegex = / ?@(fig|tbl):([a-zA-Z0-9_\-]+) ?/g;
        let refMatch;
        while ((refMatch = refRegex.exec(text)) !== null) {
            addDecoration(refMatch.index, refMatch.index + refMatch[0].length, refMatch[1], refMatch[2], false);
        }

        return Decoration.set(widgets.sort((a, b) => a.from - b.from));
    },
    provide: (field) => EditorView.decorations.from(field)
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
        const match = sub.match(/(@(fig|tbl)?:?([a-zA-Z0-9_\-]*))$/);
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
        const text = context.editor.getValue();
        const defs = scanDefinitions(text, this.plugin.settings);
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
            this.plugin.settings.figPrefix = value; currentSettings.figPrefix = value; await this.plugin.saveSettings(); this.plugin.app.workspace.updateOptions(); 
        }));
        new Setting(containerEl).setName('表格前缀').addText(text => text.setValue(this.plugin.settings.tblPrefix).onChange(async (value) => {
            this.plugin.settings.tblPrefix = value; currentSettings.tblPrefix = value; await this.plugin.saveSettings(); this.plugin.app.workspace.updateOptions();
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
        this.registerEvent(this.app.workspace.on('editor-paste', this.handleImagePaste.bind(this)));
    }

    async loadSettings() { this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData()); }
    async saveSettings() { await this.saveData(this.settings); }

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
