/* main.js - Pandoc Live Preview Plugin (v3.7.0: 3.6.0 + custom-style 双语题注渲染 + [-@fig:id] 抑制前缀引用) */
const { Plugin, EditorSuggest, requestUrl, Notice, PluginSettingTab, Setting, FileSystemAdapter, ItemView, MarkdownView } = require('obsidian');
const { StateField } = require('@codemirror/state');
const { Decoration, EditorView, WidgetType } = require('@codemirror/view');
const path = require('path');

// === 视图常量 ===
const VIEW_TYPE_PANDOC_OUTLINE = "pandoc-outline-view";

// === 默认设置 ===
const DEFAULT_SETTINGS = {
    picgoUrl: "http://127.0.0.1:36677/upload",
    autoUpload: true,
    addNewLineAroundImage: true,
    hideGapAroundImage: true,
    deleteLocal: true,
    figPrefix: "图",
    tblPrefix: "表",
    eqPrefix: "式",
    autoParentheses: true,
    enableClickToJump: true,

    // 样式设置
    captionColor: "#1e88e5",
    captionBold: true,
    captionCenter: true,
    captionTopOffset: 6,
    captionBottomDistance: 12,
    referenceColor: "#1e88e5",
    referenceBold: false
};

// === 辅助函数 ===
function getTimestamp() {
    const now = new Date();
    return `${now.getFullYear()}${(now.getMonth()+1).toString().padStart(2,'0')}${now.getDate().toString().padStart(2,'0')}${now.getHours().toString().padStart(2,'0')}${now.getMinutes().toString().padStart(2,'0')}${now.getSeconds().toString().padStart(2,'0')}`;
}

// === 1. 标签组件 (LabelWidget) ===
class LabelWidget extends WidgetType {
    constructor(text, type, isDef, caption = "", suffix = "", hasParen = false, targetPos = null, settings = null, status = "normal", plain = false) {
        super();
        this.text = text;
        this.type = type;
        this.isDef = isDef;
        this.caption = caption;
        this.suffix = suffix;
        this.hasParen = hasParen;
        this.targetPos = targetPos;
        this.settings = settings;
        this.status = status;
        this.plain = plain; // [-@fig:id] 抑制前缀形态：纯编号，无底色
    }

    toDOM(view) {
        const span = document.createElement("span");
        let content = this.text;

        if (this.isDef) {
            if (this.caption) content = `${this.text} ${this.caption}`;
        } else {
            if (this.status === "broken") {
                content = `⛔ @${this.type}:${this.text}`;
            } else {
                content = `${this.text}${this.suffix}`;
                if (this.hasParen) content = `(${content})`;
            }
        }

        span.innerText = content;
        span.className = `pandoc-widget pandoc-${this.type} pandoc-${this.isDef ? 'def' : 'ref'}`;
        if (this.plain) span.classList.add('pandoc-plain');

        if (this.isDef && this.status === "unused") {
            span.classList.add('pandoc-unused');
            span.title = "警告：此图表未被引用";
        }
        if (!this.isDef && this.status === "broken") {
            span.classList.add('pandoc-broken');
            span.title = "错误：引用的ID不存在！";
        }

        if (this.settings && this.status !== "broken") {
            if (this.isDef) {
                if (this.status !== "unused" && this.settings.captionColor) span.style.color = this.settings.captionColor;
                span.style.fontWeight = this.settings.captionBold ? '600' : '400';
                span.style.textAlign = this.settings.captionCenter ? 'center' : 'left';
                span.style.marginTop = `${this.settings.captionTopOffset}px`;
                span.style.marginBottom = `${this.settings.captionBottomDistance}px`;
            } else {
                if (this.settings.referenceColor) span.style.color = this.settings.referenceColor;
                span.style.fontWeight = this.settings.referenceBold ? '600' : '400';
            }
        }

        if(this.caption) span.classList.add('has-caption');

        if (!this.isDef && this.settings && this.settings.enableClickToJump && this.targetPos !== null && this.status !== "broken") {
            span.classList.add('pandoc-clickable');
            span.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();
                view.dispatch({ selection: { anchor: this.targetPos, head: this.targetPos }, scrollIntoView: true });
            };
        }
        return span;
    }
}

// === 2. 隐藏组件 ===
class TopGapWidget extends WidgetType {
    toDOM(view) { const span = document.createElement("span"); span.className = "pandoc-gap"; return span; }
}

// === 3. 全文审计扫描 (Audit) ===
let currentSettings = Object.assign({}, DEFAULT_SETTINGS);
// 设置（前缀/样式）变更时递增：已打开的编辑器在下一个事务里检测到 epoch 不一致即重新扫描
let settingsEpoch = 0;
// 源码模式下不渲染 widget，显示原始标签文本（切回实时预览自动恢复）
let isSourceMode = false;
// 按 Doc 缓存扫描与装饰规格：Doc 不可变（编辑即生成新 Doc，自然失效），
// 编辑器关闭后缓存随 Doc 一起被 GC 回收，无需手动清理
const scanCache = new WeakMap();

// 标签定义正则（fig/tbl/eq，标题部分用「前瞻捕获 + 反向引用」模拟原子组，
// 修复旧写法 (?:\s+.*?)? 在「未闭合 id + 长空行」上的二次方回溯）
const DEF_REGEX = /\{#(?<dType>fig|tbl|eq):(?<dId>[a-zA-Z0-9_\-]+)(?=(?<dCap>(?:\s+[^\n{}]*)?))\k<dCap>\}/g;
// 引用正则（fig/tbl/eq，全命名组），两种形态：
// 1) [-@fig:id]：抑制前缀的编号引用（学位论文双语题注常用），整体替换为纯编号 N
// 2) ( @fig:id ) / @fig:id：普通引用，支持前括号+空格、子图后缀字母（图1a）、尾括号
const REF_REGEX = /\[[-][ \t]*@(?<sType>fig|tbl|eq):(?<sId>[a-zA-Z0-9_\-]+)[ \t]*\]|(?<lead>\(?[ \t]*)@(?<rType>fig|tbl|eq):(?<rId>[a-zA-Z0-9_\-]+)(?:[ \t]+(?<suffix>[a-zA-Z]))?(?<tail>[ \t]*\)?)/g;
// fenced div 围栏行：::: {custom-style="..."} / ::: {.class} / :::
// （带属性视为开启，无属性且栈非空视为关闭）
const FENCE_REGEX = /^\s*(:::+)[ \t]*(\{.*\})?[ \t]*$/;

// 各类型标签的显示前缀
function prefixOf(type) {
    if (type === 'fig') return currentSettings.figPrefix;
    if (type === 'tbl') return currentSettings.tblPrefix;
    return currentSettings.eqPrefix;
}

function scanDocumentStats(text, settings) {
    const definitions = [];
    const references = [];
    const undefinedImages = [];

    // 1. 扫描定义 ({#fig:xxx} / {#tbl:xxx} / {#eq:xxx})
    let figCount = 0;
    let tblCount = 0;
    let eqCount = 0;
    let defMatch;
    while ((defMatch = DEF_REGEX.exec(text)) !== null) {
        const g = defMatch.groups;
        const type = g.dType;
        const id = g.dId;
        const number = type === 'fig' ? ++figCount : type === 'tbl' ? ++tblCount : ++eqCount;
        const label = `${prefixOf(type)}${number}`;

        // 提取标题（向上回溯图片 alt / 表格行尾标题；公式默认用 id）
        let caption = id;
        const lookBackText = text.slice(Math.max(0, defMatch.index - 500), defMatch.index);
        // 提取标题时支持尖括号路径
        const imgMatch = lookBackText.match(/!\[([^\]]*)\]\((?:<[^>]+>|[^\)]+)\)\s*$/);
        if (imgMatch && imgMatch[1]) caption = imgMatch[1].trim();
        const tblMatch = lookBackText.match(/(:[^\r\n{]+)$/);
        if (tblMatch) caption = tblMatch[1].substring(1).trim();

        definitions.push({
            id: id, type: type, label: label, fullId: `${type}:${id}`,
            position: defMatch.index, caption: caption || id,
            isUnused: true
        });
    }

    // 2. 扫描引用 (@fig:xxx / @tbl:xxx / @eq:xxx，含 [-@fig:xxx] 抑制前缀形态)
    const definedIds = new Set(definitions.map(d => d.id));
    let refMatch;
    while ((refMatch = REF_REGEX.exec(text)) !== null) {
        const g = refMatch.groups;
        const type = (g.sId !== undefined) ? g.sType : g.rType;
        const id = (g.sId !== undefined) ? g.sId : g.rId;
        references.push({
            id: id, type: type, position: refMatch.index,
            fullText: refMatch[0], isBroken: !definedIds.has(id)
        });
    }

    // 3. 修正定义的未使用状态
    const usedIds = new Set(references.map(r => r.id));
    definitions.forEach(def => {
        if (usedIds.has(def.id)) def.isUnused = false;
    });

    // 4. 扫描未定义ID的图片（支持尖括号路径 <path> 和普通路径）
    const imgRegex = /!\[([^\]]*)\]\((?:<[^>]+>|[^\)]+)\)/g;
    let imgM;
    while ((imgM = imgRegex.exec(text)) !== null) {
        const endPos = imgM.index + imgM[0].length;
        const nextText = text.slice(endPos, endPos + 50);
        if (!/^\s*\{#fig:/.test(nextText)) {
            undefinedImages.push({ caption: imgM[1] || "未命名图片", position: imgM.index });
        }
    }

    // 5. 提取失效引用
    const orphanRefs = references.filter(r => r.isBroken);

    return { definitions, references, orphanRefs, undefinedImages };
}

// === 4. 核心装饰器 ===
// 只依赖文本的重活（编号/标题回溯/空行吞噬/间距组件）按 Doc 算一次并缓存；
// 光标重叠的显隐切换在每次事务里用缓存好的规格廉价重建，大文档不再每个光标移动都全文重扫
function buildDecorationSpecs(text) {
    const stats = scanDocumentStats(text, currentSettings);
    const definitions = stats.definitions;

    const numbers = new Map();   // fullId -> 编号
    const posMap = new Map();    // id -> 定义位置
    const unusedMap = new Map(); // id -> 是否未被引用
    const defSet = new Set();    // 已定义的 id 集合

    definitions.forEach(def => {
        numbers.set(`${def.type}:${def.id}`, def.label.slice(prefixOf(def.type).length));
        posMap.set(def.id, def.position);
        unusedMap.set(def.id, def.isUnused);
        defSet.add(def.id);
    });

    const specs = [];

    function consumeImmediateNewlines(text, currentStart) {
        let tempStart = currentStart;
        while (tempStart > 0) {
            if (text[tempStart - 1].match(/[\n\r ]/)) tempStart--; else break;
        }
        return tempStart;
    }
    function consumeHorizontalSpaces(text, pos) {
        while (pos < text.length) {
            if (text[pos] === ' ' || text[pos] === '\t') pos++; else break;
        }
        return pos;
    }

    function addSpec(start, end, type, id, isDef, suffix = "", hasParen = false, plain = false) {
        let number = "?";
        let caption = "";
        let targetPos = null;
        let status = "normal";

        if (isDef) {
            if (unusedMap.has(id) && unusedMap.get(id)) status = "unused";
        } else {
            if (!defSet.has(id)) status = "broken";
        }

        if (type === 'fig') {
            if (numbers.has(`fig:${id}`)) number = numbers.get(`fig:${id}`);
            if (isDef) {
                const lookBackLimit = Math.max(0, start - 500);
                const precedingText = text.slice(lookBackLimit, start);
                const imgMatch = precedingText.match(/!\[([^\]]*)\]\([^\)]+\)\s*$/);

                if (imgMatch) {
                    caption = imgMatch[1].trim();
                    if (currentSettings.hideGapAroundImage) {
                        const imgStartPos = start - imgMatch[0].length;
                        if (imgStartPos > 0 && text[imgStartPos - 1] === '\n') {
                            const gapStart = imgStartPos - 1;
                            specs.push(Decoration.replace({ widget: new TopGapWidget(), inclusive: false }).range(gapStart, imgStartPos));
                        }
                        start = consumeImmediateNewlines(text, start);
                    }
                }
                if (currentSettings.hideGapAroundImage) {
                    let checkPos = consumeHorizontalSpaces(text, end);
                    if (checkPos < text.length) {
                        if (text.startsWith('\r\n', checkPos)) end = checkPos + 2;
                        else if (text[checkPos] === '\n') end = checkPos + 1;
                    }
                }
            }
        } else if (type === 'tbl') {
            if (numbers.has(`tbl:${id}`)) number = numbers.get(`tbl:${id}`);
            if (isDef) {
                const lookBackLimit = Math.max(0, start - 1000);
                const match = text.slice(lookBackLimit, start).match(/(:[^\r\n{]+)$/);
                if (match) {
                    caption = match[1].substring(1).trim();
                    start = start - match[0].length;
                    start = consumeImmediateNewlines(text, start);
                }
            }
        } else if (type === 'eq') {
            if (numbers.has(`eq:${id}`)) number = numbers.get(`eq:${id}`);
        }

        if (!isDef && posMap.has(id)) targetPos = posMap.get(id);

        let widgetText;
        if (status === "broken") widgetText = id;
        else if (plain) widgetText = `${number}`;
        else widgetText = `${prefixOf(type)}${number}`;

        specs.push(Decoration.replace({
            widget: new LabelWidget(widgetText, type, isDef, caption, suffix, hasParen, targetPos, currentSettings, status, plain),
            inclusive: false
        }).range(start, end));
    }

    let defMatch;
    while ((defMatch = DEF_REGEX.exec(text)) !== null) {
        const g = defMatch.groups;
        addSpec(defMatch.index, defMatch.index + defMatch[0].length, g.dType, g.dId, true);
    }

    let refMatch;
    while ((refMatch = REF_REGEX.exec(text)) !== null) {
        const g = refMatch.groups;
        if (g.sId !== undefined) {
            // [-@fig:id] 抑制前缀形态：整体替换为纯编号
            addSpec(refMatch.index, refMatch.index + refMatch[0].length, g.sType, g.sId, false, "", false, true);
        } else {
            const hasParen = (g.lead.includes('(') && g.tail.includes(')'));
            addSpec(refMatch.index, refMatch.index + refMatch[0].length, g.rType, g.rId, false, g.suffix || "", hasParen);
        }
    }

    // 6. 自定义样式 Div（双语题注等）：题注内容行加样式，围栏行淡化
    //    带属性的围栏视为 Div 开启（无 custom-style 的入栈但不作题注），无属性围栏在栈非空时视为关闭
    let linePos = 0;
    const openDivs = [];
    const lineList = text.split('\n');
    for (let i = 0; i < lineList.length; i++) {
        const line = lineList[i];
        const lineStart = linePos;
        linePos += line.length + 1;

        const fenceM = line.match(FENCE_REGEX);
        if (fenceM) {
            if (fenceM[2]) {
                const csM = fenceM[2].match(/custom-style[ \t]*=[ \t]*"([^"]+)"/);
                openDivs.push({ styleName: csM ? csM[1] : null, isCaption: csM ? /caption|题注/i.test(csM[1]) : false });
                specs.push(Decoration.line({ class: 'pandoc-div-fence' }).range(lineStart));
            } else if (openDivs.length > 0) {
                openDivs.pop();
                specs.push(Decoration.line({ class: 'pandoc-div-fence' }).range(lineStart));
            }
            continue;
        }
        if (openDivs.length > 0 && line.trim() !== '') {
            // 从最内层向外找题注样式
            for (let k = openDivs.length - 1; k >= 0; k--) {
                if (openDivs[k].isCaption) {
                    const en = /(?:^|[\s_"-])(en|english|英文)(?:[\s_"-]|$)/i.test(openDivs[k].styleName);
                    specs.push(Decoration.line({ class: `pandoc-caption-line ${en ? 'pandoc-caption-en' : 'pandoc-caption-cn'}` }).range(lineStart));
                    break;
                }
            }
        }
    }

    specs.sort((a, b) => a.from - b.from);
    return { stats, specs };
}

// 按 Doc 复用扫描与装饰规格：编辑生成新 Doc 自动 miss；设置变更（epoch 不一致）自动失效
function getDecorations(doc) {
    const cached = scanCache.get(doc);
    if (cached && cached.epoch === settingsEpoch) return cached;
    const result = buildDecorationSpecs(doc.toString());
    result.epoch = settingsEpoch;
    scanCache.set(doc, result);
    return result;
}

// 从编辑器取扫描结果：优先复用按 Doc 的共享缓存（与装饰器共用），避免重复全文扫描
function getStatsForEditor(editor) {
    if (editor.cm && editor.cm.state && editor.cm.state.doc) return getDecorations(editor.cm.state.doc).stats;
    return buildDecorationSpecs(editor.getValue()).stats;
}

// 光标落在标签上时显示原始源码（与 3.5.0 行为一致）
function applySpecs(specs, selectionRanges) {
    const kept = [];
    for (const spec of specs) {
        if (spec.from === spec.to) { kept.push(spec); continue; } // 行装饰（题注/围栏样式）不随光标隐藏
        let suppressed = false;
        for (const range of selectionRanges) {
            if (range.from <= spec.to && range.to >= spec.from) { suppressed = true; break; }
        }
        if (!suppressed) kept.push(spec);
    }
    return Decoration.set(kept, true);
}

const pandocRefField = StateField.define({
    create(state) {
        // 打开文档时立即渲染（源码模式下暂不显示，索引仍建立，切回实时预览即可恢复）
        const { specs } = getDecorations(state.doc);
        return {
            epoch: settingsEpoch,
            sourceMode: isSourceMode,
            specs,
            decorations: isSourceMode ? Decoration.none : applySpecs(specs, state.selection.ranges)
        };
    },
    update(value, transaction) {
        // 文档变化，或设置（前缀/样式）刚被修改（epoch 不一致）→ 重新扫描
        if (transaction.docChanged || value.epoch !== settingsEpoch) {
            const { specs } = getDecorations(transaction.state.doc);
            return {
                epoch: settingsEpoch,
                sourceMode: isSourceMode,
                specs,
                decorations: isSourceMode ? Decoration.none : applySpecs(specs, transaction.state.selection.ranges)
            };
        }
        // 模式切换、纯光标/选择变化：不重扫全文，用已有规格廉价重建（处理移入/移出标签的显隐切换）
        if (value.sourceMode !== isSourceMode || transaction.selection) {
            return {
                epoch: value.epoch,
                sourceMode: isSourceMode,
                specs: value.specs,
                decorations: isSourceMode ? Decoration.none : applySpecs(value.specs, transaction.state.selection.ranges)
            };
        }
        return value;
    },
    provide: (field) => EditorView.decorations.from(field, (v) => v.decorations)
});

// === 5. 侧边栏视图 ===
class PandocOutlineView extends ItemView {
    constructor(leaf, plugin) {
        super(leaf);
        this.plugin = plugin;
        this.updateDebounce = this.debounce(this.updateView.bind(this), 500);
    }

    getViewType() { return VIEW_TYPE_PANDOC_OUTLINE; }
    getDisplayText() { return "图表审计 (Pandoc)"; }
    getIcon() { return "image-file"; }

    async onOpen() {
        this.registerEvent(this.app.workspace.on('editor-change', this.updateDebounce));
        this.registerEvent(this.app.workspace.on('file-open', this.updateView.bind(this)));
        this.updateView();
    }

    async updateView() {
        const container = this.contentEl;
        container.empty();
        container.addClass("pandoc-outline-container");

        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (!view) {
            container.createEl("div", { text: "未激活 Markdown 编辑器" });
            return;
        }

        const { definitions, orphanRefs, undefinedImages } = getStatsForEditor(view.editor);

        const header = container.createEl("div", { cls: "pandoc-outline-header" });
        header.createEl("div", { text: `📊 统计概览` });
        header.createEl("small", { text: `定义: ${definitions.length} | 引用失效: ${orphanRefs.length} | 未定义: ${undefinedImages.length}`, style: "opacity:0.8" });

        if (orphanRefs.length > 0) {
            container.createEl("div", { cls: "pandoc-section-title", text: "⛔ 引用失效 (找不到定义)", style: "color: #d32f2f;" });
            orphanRefs.forEach(ref => {
                const el = container.createEl("div", { cls: "pandoc-outline-item pandoc-item-broken" });
                el.createEl("span", { text: ref.fullText });
                el.createEl("small", { text: `行 ${view.editor.offsetToPos(ref.position).line + 1}` });
                el.addEventListener("click", () => {
                    view.editor.setCursor(view.editor.offsetToPos(ref.position));
                    view.editor.focus();
                    view.editor.scrollIntoView({ from: view.editor.offsetToPos(ref.position), to: view.editor.offsetToPos(ref.position) }, true);
                });
            });
        }

        if (undefinedImages.length > 0) {
            container.createEl("div", { cls: "pandoc-section-title", text: "⚠️ 未打标签的图片", style: "color: #7f8c8d;" });
            undefinedImages.forEach(img => {
                const el = container.createEl("div", { cls: "pandoc-outline-item pandoc-item-missing-id" });
                el.createEl("span", { text: img.caption });
                el.addEventListener("click", () => {
                    view.editor.setCursor(view.editor.offsetToPos(img.position));
                    view.editor.focus();
                    view.editor.scrollIntoView({ from: view.editor.offsetToPos(img.position), to: view.editor.offsetToPos(img.position) }, true);
                });
            });
        }

        if (definitions.length > 0) {
            container.createEl("div", { cls: "pandoc-section-title", text: "📑 图表定义列表" });
            definitions.forEach(def => {
                let itemCls = "pandoc-item-normal";
                let statusText = "";
                if (def.isUnused) {
                    itemCls = "pandoc-item-unused";
                    statusText = "(未使用)";
                }
                const el = container.createEl("div", { cls: `pandoc-outline-item ${itemCls}` });
                el.createEl("span", { text: `${def.label} ${def.caption}` });
                if(statusText) el.createEl("span", { text: statusText, cls: "pandoc-tag" });
                el.addEventListener("click", () => {
                    view.editor.setCursor(view.editor.offsetToPos(def.position));
                    view.editor.focus();
                    view.editor.scrollIntoView({ from: view.editor.offsetToPos(def.position), to: view.editor.offsetToPos(def.position) }, true);
                });
            });
        }
    }

    debounce(func, wait) {
        let timeout;
        return function(...args) {
            const context = this;
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(context, args), wait);
        };
    }
}

// === 6. 自动补全 ===
class PandocSuggest extends EditorSuggest {
    constructor(plugin) {
        super(plugin.app);
        this.plugin = plugin;
        this.limit = 1000; // 增加建议数量限制，解决大文档显示不全问题
    }
    onTrigger(cursor, editor, file) {
        const line = editor.getLine(cursor.line);
        const sub = line.substring(0, cursor.ch);
        const match = sub.match(/(@(fig|tbl|eq)?:?([a-zA-Z0-9_\-]*))$/);
        if (match) return { start: { line: cursor.line, ch: match.index }, end: cursor, query: match[0] };
        return null;
    }
    getSuggestions(context) {
        const defs = getStatsForEditor(context.editor).definitions;
        const query = context.query.toLowerCase();
        return defs.filter(def => `@${def.type}:${def.id}`.toLowerCase().includes(query))
                   .map(def => ({ ...def, suggestionText: `@${def.type}:${def.id}` }));
    }
    renderSuggestion(suggestion, el) {
        el.createEl("span", { text: suggestion.label, cls: "pandoc-suggest-label" });
        el.createEl("small", { text: ` (${suggestion.id})`, cls: "pandoc-suggest-id" });
    }
    selectSuggestion(suggestion, event) {
        const context = this.context;
        if (!context) return;
        let textToInsert = suggestion.suggestionText;
        if (this.plugin.settings.autoParentheses) textToInsert = `( ${textToInsert} )`;
        context.editor.replaceRange(textToInsert, context.start, context.end);
    }
}

// === 7. 设置面板 ===
class PandocLivePreviewSettingTab extends PluginSettingTab {
    constructor(app, plugin) { super(app, plugin); this.plugin = plugin; }
    display() {
        const { containerEl } = this;
        containerEl.empty();
        containerEl.createEl('h2', { text: 'Pandoc Live Preview v3.7.0 设置' });

        new Setting(containerEl).setName('PicGo 上传接口').addText(t => t.setValue(this.plugin.settings.picgoUrl).onChange(async v => { this.plugin.settings.picgoUrl = v; await this.plugin.saveSettings(); }));
        new Setting(containerEl).setName('剪切板自动上传').addToggle(t => t.setValue(this.plugin.settings.autoUpload).onChange(async v => { this.plugin.settings.autoUpload = v; await this.plugin.saveSettings(); }));
        new Setting(containerEl).setName('图片前后增加空行').addToggle(t => t.setValue(this.plugin.settings.addNewLineAroundImage).onChange(async v => { this.plugin.settings.addNewLineAroundImage = v; await this.plugin.saveSettings(); }));
        new Setting(containerEl).setName('预览时隐藏图片空行').addToggle(t => t.setValue(this.plugin.settings.hideGapAroundImage).onChange(async v => { this.plugin.settings.hideGapAroundImage = v; this.plugin.refreshEditors(); await this.plugin.saveSettings(); }));
        new Setting(containerEl).setName('上传后移除本地文件').addToggle(t => t.setValue(this.plugin.settings.deleteLocal).onChange(async v => { this.plugin.settings.deleteLocal = v; await this.plugin.saveSettings(); }));

        containerEl.createEl('h3', { text: '视觉与位置' });
        new Setting(containerEl).setName('图表名颜色').addColorPicker(c => c.setValue(this.plugin.settings.captionColor).onChange(async v => { this.plugin.settings.captionColor = v; currentSettings.captionColor = v; await this.plugin.saveSettings(); this.plugin.refreshEditors(); }));
        new Setting(containerEl).setName('图表名加粗').addToggle(t => t.setValue(this.plugin.settings.captionBold).onChange(async v => { this.plugin.settings.captionBold = v; currentSettings.captionBold = v; await this.plugin.saveSettings(); this.plugin.refreshEditors(); }));
        new Setting(containerEl).setName('图表名居中显示').addToggle(t => t.setValue(this.plugin.settings.captionCenter).onChange(async v => { this.plugin.settings.captionCenter = v; currentSettings.captionCenter = v; await this.plugin.saveSettings(); this.plugin.refreshEditors(); }));

        new Setting(containerEl).setName('图表名 上方 间距').addSlider(s => s.setLimits(-50, 50, 1).setValue(this.plugin.settings.captionTopOffset).setDynamicTooltip().onChange(async v => { this.plugin.settings.captionTopOffset = v; currentSettings.captionTopOffset = v; await this.plugin.saveSettings(); this.plugin.refreshEditors(); }));
        new Setting(containerEl).setName('图表名 下方 间距').addSlider(s => s.setLimits(0, 100, 1).setValue(this.plugin.settings.captionBottomDistance).setDynamicTooltip().onChange(async v => { this.plugin.settings.captionBottomDistance = v; currentSettings.captionBottomDistance = v; await this.plugin.saveSettings(); this.plugin.refreshEditors(); }));

        new Setting(containerEl).setName('引用处颜色').addColorPicker(c => c.setValue(this.plugin.settings.referenceColor).onChange(async v => { this.plugin.settings.referenceColor = v; currentSettings.referenceColor = v; await this.plugin.saveSettings(); this.plugin.refreshEditors(); }));
        new Setting(containerEl).setName('引用处加粗').addToggle(t => t.setValue(this.plugin.settings.referenceBold).onChange(async v => { this.plugin.settings.referenceBold = v; currentSettings.referenceBold = v; await this.plugin.saveSettings(); this.plugin.refreshEditors(); }));

        new Setting(containerEl).setName('启用单击跳转').addToggle(t => t.setValue(this.plugin.settings.enableClickToJump).onChange(async v => { this.plugin.settings.enableClickToJump = v; await this.plugin.saveSettings(); this.plugin.refreshEditors(); }));
        new Setting(containerEl).setName('引用自动加括号').addToggle(t => t.setValue(this.plugin.settings.autoParentheses).onChange(async v => { this.plugin.settings.autoParentheses = v; await this.plugin.saveSettings(); }));

        containerEl.createEl('h3', { text: '前缀设置' });
        new Setting(containerEl).setName('图片前缀').addText(t => t.setValue(this.plugin.settings.figPrefix).onChange(async v => { this.plugin.settings.figPrefix = v; currentSettings.figPrefix = v; await this.plugin.saveSettings(); this.plugin.refreshEditors(); }));
        new Setting(containerEl).setName('表格前缀').addText(t => t.setValue(this.plugin.settings.tblPrefix).onChange(async v => { this.plugin.settings.tblPrefix = v; currentSettings.tblPrefix = v; await this.plugin.saveSettings(); this.plugin.refreshEditors(); }));
        new Setting(containerEl).setName('公式前缀').addText(t => t.setValue(this.plugin.settings.eqPrefix).onChange(async v => { this.plugin.settings.eqPrefix = v; currentSettings.eqPrefix = v; await this.plugin.saveSettings(); this.plugin.refreshEditors(); }));
    }
}

// === 8. 插件主类 ===
module.exports = class PandocLivePreview extends Plugin {
    async onload() {
        await this.loadSettings();
        currentSettings = this.settings;
        this.registerView(VIEW_TYPE_PANDOC_OUTLINE, (leaf) => new PandocOutlineView(leaf, this));
        this.registerEditorExtension(pandocRefField);
        this.registerEditorSuggest(new PandocSuggest(this));
        this.addSettingTab(new PandocLivePreviewSettingTab(this.app, this));
        this.addCommand({ id: 'insert-fig-id', name: 'Insert Figure ID', editorCallback: (e) => e.replaceSelection(`{#fig:${getTimestamp()}}`) });
        this.addCommand({ id: 'insert-tbl-id', name: 'Insert Table ID', editorCallback: (e) => e.replaceSelection(`{#tbl:${getTimestamp()}}`) });
        this.addCommand({ id: 'insert-eq-id', name: 'Insert Equation ID', editorCallback: (e) => e.replaceSelection(`{#eq:${getTimestamp()}}`) });
        this.addCommand({ id: 'open-pandoc-outline', name: '打开图表管理面板 (Pandoc Manager)', callback: () => this.activateView() });
        this.addRibbonIcon('image-file', 'Pandoc 图表管理', () => { this.activateView(); });
        this.registerEvent(this.app.workspace.on('editor-paste', this.handleImagePaste.bind(this)));
        // 源码模式检测：源码模式下显示原始标签，切回实时预览恢复渲染
        this.registerEvent(this.app.workspace.on('layout-ready', () => { this.updateSourceModeStatus(); }));
        this.registerEvent(this.app.workspace.on('active-leaf-change', () => { this.updateSourceModeStatus(); }));
    }

    async activateView() {
        const { workspace } = this.app;
        let leaf = workspace.getLeavesOfType(VIEW_TYPE_PANDOC_OUTLINE)[0];
        if (!leaf) {
            const rightLeaf = workspace.getRightLeaf(false);
            if (rightLeaf) { await rightLeaf.setViewState({ type: VIEW_TYPE_PANDOC_OUTLINE, active: true }); leaf = workspace.getLeavesOfType(VIEW_TYPE_PANDOC_OUTLINE)[0]; }
        }
        if (leaf) workspace.revealLeaf(leaf);
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

    // 设置（前缀/样式）变更后：递增 epoch 并让所有编辑器立即重扫
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
                    const arrayBuffer = await file.arrayBuffer();
                    const extension = file.type.split('/')[1] || 'png';
                    const fileName = `Image_${timestamp}.${extension}`;
                    const filePath = await this.app.fileManager.getAvailablePathForAttachment(fileName);
                    await this.app.vault.createBinary(filePath, arrayBuffer);
                    let absolutePath;
                    if (this.app.vault.adapter instanceof FileSystemAdapter) absolutePath = path.join(this.app.vault.adapter.getBasePath(), filePath);
                    else { new Notice("PicGo 上传仅支持桌面版"); return; }
                    const response = await requestUrl({ url: this.settings.picgoUrl, method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ list: [absolutePath] }) });
                    const resData = response.json;
                    if (resData.success && resData.result && resData.result.length > 0) {
                        const remoteUrl = resData.result[0];
                        let finalStr = `![](${remoteUrl}){#fig:${timestamp}}`;
                        if (this.settings.addNewLineAroundImage) finalStr = `\n\n${finalStr}\n\n`;
                        const doc = editor.getValue();
                        if (doc.includes(placeholder)) { editor.setValue(doc.replace(placeholder, finalStr)); new Notice(`图片上传成功!`); } else { editor.replaceSelection(finalStr); }
                        if (this.settings.deleteLocal) { const fileToDelete = this.app.vault.getAbstractFileByPath(filePath); if (fileToDelete) await this.app.vault.delete(fileToDelete); }
                    } else { new Notice("PicGo 上传失败"); editor.setValue(editor.getValue().replace(placeholder, "")); }
                } catch (error) { console.error("Upload Error:", error); new Notice(`上传出错: ${error.message}`); editor.setValue(editor.getValue().replace(placeholder, "")); }
            }
        }
    }
};
