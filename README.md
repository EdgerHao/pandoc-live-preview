# Pandoc Live Preview for Obsidian

[中文说明](#中文说明) | [Report Bug](https://github.com/wanxinhao/pandoc-live-preview/issues)

This is an Obsidian plugin that provides **real-time preview** for Pandoc citations and cross-references. It is specifically optimized for **Academic Writing** workflows involving Pandoc and CJK (Chinese/Japanese/Korean) layouts.

Now with **PicGo Integration**, it streamlines the entire "Paste -> Upload -> Cite" workflow!

## ✨ Features

- **Real-time Rendering**: Instantly turns `@fig:id` into readable labels like **图1** (Figure 1) or **表1** (Table 1) in Live Preview mode.
- **🖼️ Auto Image Upload (PicGo)**: 
    - Paste an image, and it automatically uploads to your **PicGo server**.
    - Automatically appends a unique ID: `![](...){#fig:2025...}`.
    - Option to **delete the local file** after successful upload to keep your vault clean.
- **⚡ Smart Autocomplete**: Type `@` to trigger a suggestion menu of all figures and tables in your document. No need to memorize long IDs!
- **⚡ Quick ID Generation**: Use commands to insert unique, timestamp-based IDs (e.g., `{#fig:202501011200}`) instantly.
- **Interactive Editing**: Just **click** on the rendered label (e.g., `图1`) to reveal the source code (e.g., `@fig:id`) for editing. Move the cursor away to render it again.
- **Smart Spacing**: Automatically hides spaces around citations (e.g., `... as shown in @fig:a ...` becomes `...如图1所示...`), perfect for Chinese typesetting.
- **Attribute Support**: Correctly recognizes image attributes like `{#fig:id width=80%}`.

## 📥 How to Install

### Method 1: BRAT (Recommended)
1. Install the **BRAT** plugin from the Obsidian Community Plugins.
2. Add this repository URL: `https://github.com/wanxinhao/pandoc-live-preview`
3. The plugin will be automatically installed and updated.

### Method 2: Manual Installation
1. Download `main.js`, `manifest.json`, and `styles.css` from the [Releases](../../releases) page.
2. Create a folder named `pandoc-live-preview` in your vault's `.obsidian/plugins/` directory.
3. Move the downloaded files into that folder.
4. Reload Obsidian and enable the plugin.

## ⚙️ Configuration (Settings)

Go to **Settings** -> **Pandoc Live Preview** to configure:

1.  **PicGo Server URL**: Default is `http://127.0.0.1:36677/upload`.
2.  **Auto Upload from Clipboard**: Enable/Disable auto-upload when pasting images.
3.  **Delete Local File**: 
    * **On (Recommended)**: Uploads the image and deletes the local copy (keeps vault clean).
    * **Off**: Uploads the image but keeps a local backup in your attachments folder.
4.  **Prefix Settings**: Customize the display prefix (e.g., change "图" to "Fig.", "表" to "Table").

> ⚠️ **Conflict Warning**: If you are using **Image Auto Upload Plugin**, please **DISABLE** it to prevent conflicts. This plugin handles the upload logic natively.

## 🚀 Usage

**1. Define a Figure or Table:**
* **Paste Image (New!)**: Just paste (`Ctrl+V`). The plugin uploads it and adds `{#fig:timestamp}` automatically.
* **Manual**: Add a Pandoc ID `{#fig:name}` after your image.
* **Automatic (Recommended)**: Use the command palette (`Ctrl/Cmd + P`) and search for **"Insert Figure ID"**. It will insert a unique ID based on the current time, like `{#fig:202512311844}`.
    * *Tip: Bind this command to a hotkey (e.g., `Alt+F`) for maximum speed.*

**2. Reference it:**
Type **`@`** anywhere in your text. A menu will appear listing all defined figures and tables. Select one to insert the citation.
> Result: `@fig:2025...` renders as **图1**

## 🤝 Recommended

To get the full academic writing preview experience (Citations + Cross-references), we highly recommend using this plugin alongside:

* **[Pandoc Reference List](https://github.com/mgmeyers/obsidian-pandoc-reference-list)**
    * It handles bibliography citations like `(Smith, 2021)` and displays a reference list in the sidebar.

⚠️ This project will offer a better user experience when paired with [PaperBell] (https://github.com/PaperBell-Org/Obsidian-PaperBell).

---

<a name="中文说明"></a>
# 中文说明 (Chinese Readme)

这是一个专为 Obsidian 学术写作设计的插件，主要用于解决 Pandoc 交叉引用（Cross-ref）在 Obsidian 实时预览模式下无法直观显示的问题。

**v1.5.0 重大更新**：现已集成 **PicGo 自动上传** 功能，打通了“截图 -> 粘贴 -> 上传 -> 引用”的全链路！

## ✨ 核心功能

- **实时渲染**：在编辑界面（Live Preview）直接将代码 `@fig:xxx` 渲染为 **图1**，将 `@tbl:xxx` 渲染为 **表1**。
- ![](https://wanxinhao88.oss-cn-wuhan-lr.aliyuncs.com/img/20251231135057667.png)
- **🖼️ 剪切板自动上传 (PicGo)**：
    - 粘贴图片时，自动调用 PicGo 接口上传到图床。
    - 自动生成带时间戳 ID 的标准引用：`![](URL){#fig:2025...}`。
    - **自动清理**：上传成功后可选择自动删除本地的临时文件，保持仓库整洁。
- **⚡ 智能补全**：输入 **`@`** 自动弹出文档内所有图表 ID 的建议菜单，告别死记硬背 ID 的痛苦。
- ![](https://wanxinhao88.oss-cn-wuhan-lr.aliyuncs.com/img/20251231190922619.png)
- **⚡ 一键生成 ID**：提供快捷命令插入基于“年月日时分”的唯一 ID（如 `{#fig:202512311800}`）。
- ![](https://wanxinhao88.oss-cn-wuhan-lr.aliyuncs.com/img/20251231191509696.png)
-  快捷键设置建议：![](https://wanxinhao88.oss-cn-wuhan-lr.aliyuncs.com/img/20251231195516689.png)
- **点击即改**：鼠标点击渲染后的“图1”标签，或将光标移入，它会瞬间变回 `@fig:xxx` 源代码模式。
- **属性支持**：完美支持带属性的写法，如 `{#fig:id width=14cm}`。
- **无缝排版**：自动隐藏 Pandoc 语法建议保留的空格，让中文引用在视觉上连贯流畅。

## 📥 安装方法

### 方法 1：使用 BRAT 插件（推荐）
1. 在 Obsidian 社区插件市场搜索并安装 **BRAT**。
2. 在 BRAT 设置中点击 "Add Beta plugin"。
3. 输入本仓库地址：`https://github.com/wanxinhao/pandoc-live-preview`。
4. 点击添加，插件即可自动安装。

### 方法 2：手动安装
1.前往右侧的 [Releases](../../releases) 页面下载最新版本的附件（包含 `main.js`, `manifest.json`, `styles.css`）。
2. 在你的 Obsidian 库的 `.obsidian/plugins/` 目录下新建文件夹 `pandoc-live-preview`。
3. 将下载的三个文件放入该文件夹。
4. 重启 Obsidian 并启用插件。

## ⚙️ 插件设置 (Settings)

请在 Obsidian 设置面板中找到 **Pandoc Live Preview** 进行配置：

1.  **PicGo 上传接口**：默认为 `http://127.0.0.1:36677/upload` (请确保 PicGo Server 已开启)。
2.  **剪切板自动上传**：开关粘贴图片时的自动上传功能。
3.  **上传后移除本地文件**：
    * **开启 (推荐)**：上传图床成功后，自动删除本地附件文件夹中的临时文件，不占硬盘空间。
    * **关闭**：上传的同时，在本地保留一份副本作为备份。
4.  **前缀设置**：在设置里即可修改图片和表格的前缀（例如改为 Fig. / Table），无需修改代码。

> ⚠️ **冲突警告**：如果您正在使用 **Image Auto Upload Plugin**，请务必**关闭或禁用**它，否则会产生冲突。本插件已内置完整的上传逻辑。

## 🚀 使用方法

**1. 定义图表 ID**
* **粘贴图片 (推荐)**：直接粘贴截图 (`Ctrl+V`)，插件会自动上传并生成 `{#fig:时间戳}`。
* **快捷生成**：打开命令面板 (`Ctrl/Cmd + P`)，搜索 **"插入图片ID" (Insert Figure ID)**。插件会自动生成一个基于当前时间的唯一 ID。
    * *建议：在设置里将此命令绑定快捷键（如 `Alt+F`），效率起飞。*
* **手动输入**：在图片或表格后输入 `{#fig:name}`。

**2. 引用图表**
在正文中输入 **`@`** 符号，插件会自动弹出候选菜单，列出当前文档里所有的图和表。选中即可插入。
> 效果：输入 `@fig:xxx` 后，光标移开即显示为 **图1**。

## 🤝 推荐搭配

为了获得完整的学术写作预览体验（参考文献 + 交叉引用），强烈推荐配合以下插件使用：

* **[Pandoc Reference List](https://github.com/mgmeyers/obsidian-pandoc-reference-list)**
    * 它可以预览 `(Smith, 2021)` 格式的参考文献，并在侧边栏显示文献列表。配合本插件，图表和文献都能实时预览。

*⚠️ 该项目若与 [PaperBell](https://github.com/PaperBell-Org/Obsidian-PaperBell) 结合使用，会有更好的使用体验。
* PaperBell: Research, to be connected
* 👋 PaperBell 是使用 Obsidian 管理你学术生涯的终极方案。


## 📄 License

MIT License
