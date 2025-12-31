/* main.js - Pandoc Live Preview Plugin (Fix: Support Attributes) */
const { Plugin } = require('obsidian');
const { StateField, EditorState } = require('@codemirror/state');
const { Decoration, EditorView, WidgetType } = require('@codemirror/view');

// === 配置区域 ===
const FIGURE_PREFIX = "图"; 
const TABLE_PREFIX = "表";

// === 1. 定义组件 Widget ===
class LabelWidget extends WidgetType {
    constructor(text, type, isDef) {
        super();
        this.text = text;
        this.type = type;   // 'fig' or 'tbl'
        this.isDef = isDef; // true=定义处, false=引用处
    }

    toDOM(view) {
        const span = document.createElement("span");
        span.innerText = this.text;
        span.className = `pandoc-widget pandoc-${this.type} pandoc-${this.isDef ? 'def' : 'ref'}`;
        return span;
    }
}

// === 2. 建立索引 (ID -> 编号) ===
function buildIndex(doc) {
    const figMap = new Map();
    const tblMap = new Map();
    let figCount = 0;
    let tblCount = 0;
    let text = doc.toString();

    // 扫描定义：{#fig:xxx ...} 或 {#tbl:xxx ...}
    // 修改说明：
    // 1. ([a-zA-Z0-9_\-]+) 匹配 ID
    // 2. (?:\s+.*?)? 非捕获组，匹配 ID 后面的空格和属性 (例如 width=14cm)，非贪婪模式
    const regex = /\{#(fig|tbl):([a-zA-Z0-9_\-]+)(?:\s+.*?)?\}/g;
    let match;

    while ((match = regex.exec(text)) !== null) {
        const type = match[1];
        const id = match[2];
        
        if (type === 'fig') {
            figCount++;
            figMap.set(id, figCount);
        } else if (type === 'tbl') {
            tblCount++;
            tblMap.set(id, tblCount);
        }
    }
    return { figMap, tblMap };
}

// === 3. 核心装饰器逻辑 ===
const pandocRefField = StateField.define({
    create(state) {
        return Decoration.none;
    },
    update(oldDecorations, transaction) {
        if (!transaction.docChanged && !transaction.selection) return oldDecorations;

        const state = transaction.state;
        const doc = state.doc;
        const text = doc.toString();
        const widgets = [];
        const selectionRanges = state.selection.ranges;

        // 1. 构建索引
        const { figMap, tblMap } = buildIndex(doc);

        function checkCursorOverlap(start, end) {
            for (const range of selectionRanges) {
                if (range.from <= end && range.to >= start) {
                    return true;
                }
            }
            return false;
        }

        function addDecoration(match, isDef) {
            const start = match.index;
            const end = match.index + match[0].length;
            
            const type = match[1]; 
            const id = match[2];   

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

        // === A. 处理定义 {#fig:xxx width=50%} ===
        // 使用更新后的正则，允许花括号内有额外内容
        const defRegex = /\{#(fig|tbl):([a-zA-Z0-9_\-]+)(?:\s+.*?)?\}/g;
        let defMatch;
        while ((defMatch = defRegex.exec(text)) !== null) {
            addDecoration(defMatch, true);
        }

        // === B. 处理引用 @fig:xxx (吞空格版) ===
        // 引用处通常不带 width 属性，所以保持原样，只负责吞空格
        const refRegex = / ?@(fig|tbl):([a-zA-Z0-9_\-]+) ?/g;
        
        let refMatch;
        while ((refMatch = refRegex.exec(text)) !== null) {
            addDecoration(refMatch, false);
        }

        return Decoration.set(widgets.sort((a, b) => a.from - b.from));
    },
    provide: (field) => EditorView.decorations.from(field)
});

// === 4. 插件主类 ===
module.exports = class PandocLivePreview extends Plugin {
    async onload() {
        this.registerEditorExtension(pandocRefField);
    }
};
