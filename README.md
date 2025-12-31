# Pandoc Live Preview for Obsidian

[中文说明](#中文说明) | [Report Bug](https://github.com/yourusername/pandoc-live-preview/issues)

This is an Obsidian plugin that provides **real-time preview** for Pandoc citations and cross-references. It is specifically optimized for **Academic Writing** workflows involving Pandoc and CJK (Chinese/Japanese/Korean) layouts.

## ✨ Features

- **Real-time Rendering**: Instantly turns `@fig:id` into readable labels like **图1** (Figure 1) or **表1** (Table 1) in Live Preview mode.
- **⚡ Smart Autocomplete**: Type `@` to trigger a suggestion menu of all figures and tables in your document. No need to memorize long IDs!
- **⚡ Quick ID Generation**: Use commands to insert unique, timestamp-based IDs (e.g., `{#fig:202501011200}`) instantly.
- **Interactive Editing**: Just **click** on the rendered label (e.g., `图1`) to reveal the source code (e.g., `@fig:id`) for editing. Move the cursor away to render it again.
- **Smart Spacing**: Automatically hides spaces around citations (e.g., `... as shown in @fig:a ...` becomes `...如图1所示...`), perfect for Chinese typesetting.
- **Attribute Support**: Correctly recognizes image attributes like `{#fig:id width=80%}`.

## 📥 How to Install

### Method 1: BRAT (Recommended)
1. Install the **BRAT** plugin from the Obsidian Community Plugins.
2. Add this repository URL: `https://github.com/yourusername/pandoc-live-preview`
3. The plugin will be automatically installed and updated.

### Method 2: Manual Installation
1. Download `main.js`, `manifest.json`, and `styles.css` from the [Releases](../../releases) page.
2. Create a folder named `pandoc-live-preview` in your vault's `.obsidian/plugins/` directory.
3. Move the downloaded files into that folder.
4. Reload Obsidian and enable the plugin.

## 🚀 Usage

**1. Define a Figure or Table:**
* **Manual**: Add a Pandoc ID `{#fig:name}` after your image.
* **Automatic (Recommended)**: Use the command palette (`Ctrl/Cmd + P`) and search for **"Insert Figure ID"**. It will insert a unique ID based on the current time, like `{#fig:202512311844}`.
    * *Tip: Bind this command to a hotkey (e.g., `Alt+F`) for maximum speed.*

**2. Reference it:**
Type **`@`** anywhere in your text. A menu will appear listing all defined figures and tables. Select one to insert the citation.
> Result: `@fig:2025...` renders as **图1**

## 🤝 Recommended

To get the full academic writing preview experience (Citations + Cross-references), we highly recommend using this plugin alongside:
* **  [Pandoc Reference List](https://github.com/mgmeyers/obsidian-pandoc-reference-list)**
    * It handles bibliography citations like `(Smith, 2021)` and displays a reference list in the sidebar.
 
⚠️ This project will offer a better user experience when paired with [PaperBell] (https://github.com/PaperBell-Org/Obsidian-PaperBell).
    
 
---

<a name="中文说明"></a>
# 中文说明 (Chinese Readme)

这是一个专为 Obsidian 学术写作设计的插件，主要用于解决 Pandoc 交叉引用（Cross-ref）在 Obsidian 实时预览模式下无法直观显示的问题。

**特别优化**：本插件已针对中文排版进行优化，会自动处理引用符号前后的空格，使其符合中文出版规范（例如将 `如 @fig:a 所示` 显示为 `如图1所示`，消除空格间隙）。

## ✨ 核心功能

- **实时渲染**：在编辑界面（Live Preview）直接将代码 `@fig:xxx` 渲染为 **图1**，将 `@tbl:xxx` 渲染为 **表1**。
![](https://wanxinhao88.oss-cn-wuhan-lr.aliyuncs.com/img/20251231135057667.png)
- **⚡ 智能补全**：输入 **`@`** 自动弹出文档内所有图表 ID 的建议菜单，告别死记硬背 ID 的痛苦。
![](https://wanxinhao88.oss-cn-wuhan-lr.aliyuncs.com/img/20251231190922619.png)
- **⚡ 一键生成 ID**：提供快捷命令插入基于“年月日时分”的唯一 ID（如 `{#fig:202512311800}`），无需手动命名。
![](https://wanxinhao88.oss-cn-wuhan-lr.aliyuncs.com/img/20251231191509696.png)
   快捷键设置建议：![](https://wanxinhao88.oss-cn-wuhan-lr.aliyuncs.com/img/20251231195516689.png)
- **点击即改**：鼠标点击渲染后的“图1”标签，或将光标移入，它会瞬间变回 `@fig:xxx` 源代码模式。
- **属性支持**：完美支持带属性的写法，如 `{#fig:id width=14cm}`，不会因为加了宽度就失效。
- **无缝排版**：自动隐藏 Pandoc 语法建议保留的空格，让中文引用在视觉上连贯流畅。

## 📥 安装方法

### 方法 1：使用 BRAT 插件（推荐）
1. 在 Obsidian 社区插件市场搜索并安装 **BRAT**。
2. 在 BRAT 设置中点击 "Add Beta plugin"。
3. 输入本仓库地址：`https://github.com/yourusername/pandoc-live-preview` (请替换为你的真实 GitHub 地址)。
4. 点击添加，插件即可自动安装。

### 方法 2：手动安装
1.前往右侧的 [Releases](../../releases) 页面下载最新版本的附件（包含 `main.js`, `manifest.json`, `styles.css`）。
2. 在你的 Obsidian 库的 `.obsidian/plugins/` 目录下新建文件夹 `pandoc-live-preview`。
3. 将下载的三个文件放入该文件夹。
4. 重启 Obsidian 并启用插件。

## 🚀 使用方法

**1. 定义图表 ID**
* **手动输入**：在图片或表格后输入 `{#fig:name}`。
* **快捷生成（推荐）**：打开命令面板 (`Ctrl/Cmd + P`)，搜索 **"插入图片ID" (Insert Figure ID)**。插件会自动生成一个基于当前时间的唯一 ID。
    * *建议：在设置里将此命令绑定快捷键（如 `Alt+F`），效率起飞。*

**2. 引用图表**
在正文中输入 **`@`** 符号，插件会自动弹出候选菜单，列出当前文档里所有的图和表。选中即可插入。
> 效果：输入 `@fig:xxx` 后，光标移开即显示为 **图1**。

## ⚙️ 自定义配置

目前插件默认前缀为中文的“图”和“表”。
如果你需要修改为英文（Fig/Table）或其他字符，可以手动打开插件目录下的 `main.js` 文件，修改顶部的配置项：

```javascript
const FIGURE_PREFIX = "图";  // 可改为 "Fig. "
const TABLE_PREFIX = "表";   // 可改为 "Table "
```
## 🤝 推荐
若要获得完整的学术写作预览体验（包括引用和交叉引用），我们强烈建议您同时使用以下插件：
* **[Pandoc 参考列表](https://github.com/mgmeyers/obsidian-pandoc-reference-list)** 
* 它能够处理诸如 `(Smith, 2021)` 这样的参考文献引用，并在侧边栏中显示参考列表。

*⚠️ 该项目若与 [PaperBell]（https://github.com/PaperBell-Org/Obsidian-PaperBell） 结合使用，会有更好的使用体验。
* PaperBell: Research, to be connected
* 👋 PaperBell 是使用 Obsidian 管理你学术生涯的终极方案。


