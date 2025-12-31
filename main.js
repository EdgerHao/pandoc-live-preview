/* main.js - Pandoc Live Preview Plugin (Ultimate: Render + Command + Autocomplete) */
const { Plugin, EditorSuggest } = require('obsidian');
const { StateField, EditorState } = require('@codemirror/state');
const { Decoration, EditorView, WidgetType } = require('@codemirror/view');

// === 配置区域 ===
const FIGURE_PREFIX = "图"; 
const TABLE_PREFIX = "表";

// === 辅助函数：生成时间戳 ===
function getTimestamp() {
    const now = new Date();
    const year = now.getFullYear();
    const month = (now.getMonth() + 1).toString().padStart(2, '0');
    const day = now.getDate().toString().padStart(2, '0');
    const hour = now.getHours().toString().padStart(2, '0');
    const minute = now.getMinutes().toString().padStart(2, '0');
    return `${year}${month}${day}${hour}${minute}`;
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

// === 2. 建立索引逻辑 (独立出来，供渲染和补全共用) ===
function scanDefinitions(text) {
    const definitions = [];
    let figCount = 0;
    let tblCount = 0;

    // 正则：匹配 {#fig:xxx} 或 {#tbl:xxx}
    const regex = /\{#(fig|tbl):([a-zA-Z0-9_\-]+)(?:\s+.*?)?\}/g;
    let match;

    while ((match = regex.exec(text)) !== null) {
        const type = match[1];
        const id = match[2];
        let label = "";

        if (type === 'fig') {
            figCount++;
            label = `${FIGURE_PREFIX}${figCount}`;
        } else if (type === 'tbl') {
            tblCount++;
            label = `${TABLE_PREFIX}${tblCount}`;
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

// === 3. 核心装饰器 (渲染逻辑) ===
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

        // 1. 获取所有定义，建立 Map 方便查询
        const defs = scanDefinitions(text);
        const figMap = new Map();
        const tblMap = new Map();
        
        defs.forEach(def => {
            if (def.type === 'fig') figMap.set(def.id, def.label.replace(FIGURE_PREFIX, ''));
            if (def.type === 'tbl') tblMap.set(def.id, def.label.replace(TABLE_PREFIX, ''));
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
                prefix = FIGURE_PREFIX;
                if (figMap.has(id)) number = figMap.get(id);
            } else if (type === 'tbl') {
                prefix = TABLE_PREFIX;
                if (tblMap.has(id)) number = tblMap.get(id);
            }

            const displayText = `${prefix}${number}`;
            const deco = Decoration.replace({
                widget: new LabelWidget(displayText, type, isDef),
                inclusive: false
            }).range(start, end);
            widgets.push(deco);
        }

        // A. 处理定义
        const defRegex = /\{#(fig|tbl):([a-zA-Z0-9_\-]+)(?:\s+.*?)?\}/g;
        let defMatch;
        while ((defMatch = defRegex.exec(text)) !== null) {
            addDecoration(defMatch.index, defMatch.index + defMatch[0].length, defMatch[1], defMatch[2], true);
        }

        // B. 处理引用 (吞空格)
        const refRegex = / ?@(fig|tbl):([a-zA-Z0-9_\-]+) ?/g;
        let refMatch;
        while ((refMatch = refRegex.exec(text)) !== null) {
            addDecoration(refMatch.index, refMatch.index + refMatch[0].length, refMatch[1], refMatch[2], false);
        }

        return Decoration.set(widgets.sort((a, b) => a.from - b.from));
    },
    provide: (field) => EditorView.decorations.from(field)
});

// === 4. 自动补全建议类 (NEW!) ===
class PandocSuggest extends EditorSuggest {
    constructor(plugin) {
        super(plugin.app);
        this.plugin = plugin;
    }

    onTrigger(cursor, editor, file) {
        // 当用户输入 @ 时触发
        const line = editor.getLine(cursor.line);
        const sub = line.substring(0, cursor.ch);
        
        // 匹配 @ 或者 @fig 或者 @tbl
        // 这里的正则逻辑是：捕捉 @ 符号后面跟着可选的 fig/tbl 和可选的冒号
        const match = sub.match(/(@(fig|tbl)?:?([a-zA-Z0-9_\-]*))$/);

        if (match) {
            return {
                start: { line: cursor.line, ch: match.index },
                end: cursor,
                query: match[0] // 比如 "@" 或 "@fig"
            };
        }
        return null;
    }

    getSuggestions(context) {
        const text = context.editor.getValue();
        // 扫描全文找到所有定义
        const defs = scanDefinitions(text);
        const query = context.query.toLowerCase();

        // 过滤建议
        return defs.filter(def => {
            // 如果用户只输入 @，显示所有
            // 如果用户输入 @fig，只显示 fig
            // 构造备选词：@fig:id
            const suggestion = `@${def.type}:${def.id}`;
            return suggestion.toLowerCase().includes(query);
        }).map(def => ({
            ...def, // 继承 id, type, label
            suggestionText: `@${def.type}:${def.id}` // 最终要插入的文本
        }));
    }

    renderSuggestion(suggestion, el) {
        // 自定义下拉菜单的样式
        // 左边显示：图1
        // 右边显示：ID (2025...)
        el.createEl("span", { text: suggestion.label, cls: "pandoc-suggest-label" }); // 图1
        el.createEl("small", { text: ` (${suggestion.id})`, cls: "pandoc-suggest-id" }); // ID
    }

    selectSuggestion(suggestion, event) {
        const context = this.context;
        if (!context) return;
        
        // 插入时，如果是 fig 或 tbl，我们可以顺便加上空格处理（如果需要的话）
        // 这里简单处理，直接替换为 @fig:xxx
        const textToInsert = suggestion.suggestionText; 
        
        context.editor.replaceRange(
            textToInsert,
            context.start,
            context.end
        );
    }
}

// === 5. 插件主类 ===
module.exports = class PandocLivePreview extends Plugin {
    async onload() {
        // 注册渲染
        this.registerEditorExtension(pandocRefField);

        // 注册命令 (生成时间戳ID)
        this.addCommand({
            id: 'insert-fig-id-timestamp',
            name: '插入图片ID (Insert Figure ID)',
            editorCallback: (editor) => {
                const timestamp = getTimestamp();
                editor.replaceSelection(`{#fig:${timestamp}}`);
            }
        });

        this.addCommand({
            id: 'insert-tbl-id-timestamp',
            name: '插入表格ID (Insert Table ID)',
            editorCallback: (editor) => {
                const timestamp = getTimestamp();
                editor.replaceSelection(`{#tbl:${timestamp}}`);
            }
        });

        // 注册自动补全 (NEW!)
        this.registerEditorSuggest(new PandocSuggest(this));
    }
};
