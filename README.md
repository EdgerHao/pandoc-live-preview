# Pandoc Live Preview for Obsidian

[中文说明](#中文说明) | [Report Bug](https://github.com/EdgerHao/pandoc-live-preview/issues)

This is an Obsidian plugin that provides **real-time preview** for Pandoc citations and cross-references. It is specifically optimized for **Academic Writing** workflows involving Pandoc and CJK (Chinese/Japanese/Korean) layouts.

## ✨ Features

- **Real-time Rendering**: Instantly turns `@fig:id` into readable labels like **图1** (Figure 1) or **表1** (Table 1) in Live Preview mode.
- **Interactive Editing**: Just **click** on the rendered label (e.g., `图1`) to reveal the source code (e.g., `@fig:id`) for editing. Move the cursor away to render it again.
- **Smart Spacing**: Automatically hides spaces around citations (e.g., `... as shown in @fig:a ...` becomes `...如图1所示...`), perfect for Chinese typesetting.
- **Visual Distinction**: distinctive styles for Definitions (Source `{#...}`) and References (Links `@...`).

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
Add a Pandoc ID `{#fig:name}` or `{#tbl:name}` after your image or table.
> Result: `{#fig:test}` renders as **(图1)**

**2. Reference it:**
Use `@fig:name` or `@tbl:name` anywhere in your text.
> Result: `@fig:test` renders as **图1**
![](https://wanxinhao88.oss-cn-wuhan-lr.aliyuncs.com/img/20251231135057667.png)
---

<a name="中文说明"></a>
# 中文说明 (Chinese Readme)

这是一个专为 Obsidian 学术写作设计的插件，主要用于解决 Pandoc 交叉引用（Cross-ref）在 Obsidian 实时预览模式下无法直观显示的问题。

**特别优化**：本插件已针对中文排版进行优化，会自动处理引用符号前后的空格，使其符合中文出版规范（例如将 `如 @fig:a 所示` 显示为 `如图1所示`，消除空格间隙）。

## ✨ 核心功能

- **实时渲染**：在编辑界面（Live Preview）直接将代码 `@fig:xxx` 渲染为 **图1**，将 `@tbl:xxx` 渲染为 **表1**。
- **点击即改**：鼠标点击渲染后的“图1”标签，或将光标移入，它会瞬间变回 `@fig:xxx` 源代码模式，方便你修改 ID。
- **无缝排版**：自动隐藏 Pandoc 语法建议保留的空格，让中文引用在视觉上连贯流畅。
- **视觉区分**：
  - **定义处**（如图片下方的 `{#fig:a}`）：显示为深色加粗的 **(图1)**，表示这是锚点。
  - **引用处**（如正文中的 `@fig:a`）：显示为标准颜色的 **图1**，表示这是链接。

## 📥 安装方法

### 方法 1：使用 BRAT 插件（推荐）
1. 在 Obsidian 社区插件市场搜索并安装 **BRAT**。
2. 在 BRAT 设置中点击 "Add Beta plugin"。
3. 输入本仓库地址：`https://github.com/EdgerHao/pandoc-live-preview` 。
4. 点击添加，插件即可自动安装。

### 方法 2：手动安装
1.前往右侧的 [Releases](../../releases) 页面下载最新版本的附件（包含 `main.js`, `manifest.json`, `styles.css`）。
2. 在你的 Obsidian 库的 `.obsidian/plugins/` 目录下新建文件夹 `pandoc-live-preview`。
3. 将下载的三个文件放入该文件夹。
4. 重启 Obsidian 并启用插件。

## ⚙️ 自定义配置

目前插件默认前缀为中文的“图”和“表”。
如果你需要修改为英文（Fig/Table）或其他字符，可以手动打开插件目录下的 `main.js` 文件，修改顶部的配置项：

```javascript
const FIGURE_PREFIX = "图";  // 可改为 "Fig. "

const TABLE_PREFIX = "表";   // 可改为 "Table "
```

## 🤝 推荐搭配
为了获得完整的学术写作预览体验（参考文献 + 交叉引用），强烈推荐配合以下插件使用：

[Pandoc Reference List](https://github.com/mgmeyers/obsidian-pandoc-reference-list)

它可以预览 (Smith, 2021) 格式的参考文献，并在侧边栏显示文献列表。配合本插件，图表和文献都能实时预览。


