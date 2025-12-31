/* main.js - Pandoc Live Preview Plugin (No Parentheses) */
const { Plugin } = require('obsidian');
const { StateField, EditorState } = require('@codemirror/state');
const { Decoration, EditorView, WidgetType } = require('@codemirror/view');

// === 配置区域 ===
// 如果你想要 "图 1" (中间有空格)，请把下面的 "图" 改成 "图 "
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
        // 类名结构: pandoc-widget + 类型 + 是否定义
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

    // 扫描定义：{#fig:xxx} 或 {#tbl:xxx}
    const regex = /\{#(fig|tbl):([a-zA-Z0-9_\-]+)\}/g;
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
        // 检测文档变化或光标移动
        if (!transaction.docChanged && !transaction.selection) return oldDecorations;

        const state = transaction.state;
        const doc = state.doc;
        const text = doc.toString();
        const widgets = [];
        const selectionRanges = state.selection.ranges;

        // 1. 构建索引
        const { figMap, tblMap } = buildIndex(doc);

        // 辅助函数：检查光标是否碰到
        function checkCursorOverlap(start, end) {
            for (const range of selectionRanges) {
                if (range.from <= end && range.to >= start) {
                    return true;
                }
            }
            return false;
        }

        // 辅助函数：生成装饰器
        function addDecoration(match, isDef) {
            const start = match.index;
            const end = match.index + match[0].length;
            const type = match[1];
            const id = match[2];

            // 如果光标碰到这里，显示源代码，不渲染
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

            // === 核心修改在这里 ===
            // 去掉了左右的括号，直接显示 "图1"
            const displayText = `${prefix}${number}`;

            const deco = Decoration.replace({
                widget: new LabelWidget(displayText, type, isDef),
                inclusive: false
            }).range(start, end);

            widgets.push(deco);
        }

        // === A. 处理定义 {#fig:xxx} ===
        const defRegex = /\{#(fig|tbl):([a-zA-Z0-9_\-]+)\}/g;
        let defMatch;
        while ((defMatch = defRegex.exec(text)) !== null) {
            addDecoration(defMatch, true);
        }

        // === B. 处理引用 @fig:xxx ===
        const refRegex = /@(fig|tbl):([a-zA-Z0-9_\-]+)/g;
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