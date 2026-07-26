# Code-Codex

[English](README.md) | 简体中文

**Code-Codex 为 Codex Desktop 补上它缺失的项目文件树，让打开和预览项目文件变得
轻松自然。** 它是一个本地优先的文件树，提供受限的文件操作、文本预览和编辑能力，
跟随当前选中的本地任务，并且不会改动官方 Codex 的安装。

> [!IMPORTANT]
> Code-Codex 是一个非官方的社区项目，与 OpenAI 没有隶属、合作或背书关系。
> OpenAI、ChatGPT 和 Codex 可能是 OpenAI 的商标。

## 功能

- 以随机、仅回环（loopback）的 Chrome DevTools 端点启动已安装的 Windows
  Codex Desktop。
- 在原生任务侧栏和对话区域之间注入一个独立的 `<code-codex>` Shadow DOM 面板。
- 从版本化的 renderer 适配器读取当前选中的本地 thread ID，并通过官方 Codex
  App Server 协议解析其 `cwd`。
- 列出目录下的所有直接子项，包括 `.git` 等隐藏和被忽略的条目，对大文件夹分页，
  并对渲染的行做虚拟化。选中的、在原生允许列表内的文本文件会作为带行号的标签页
  在 Codex 主界面顶部打开。
- 允许对已存在且完整、符合预览条件的 UTF-8 文件（不超过 64 KiB）进行编辑并保存，
  采用乐观的版本校验。Markdown（`.md`）及其他 UTF-8 文本无论语言都能正确显示，
  包括中文内容。
- 提供紧凑的文件/文件夹右键菜单：预览、新建空文件/文件夹、同级重命名、确认删除、
  复制相对路径、在 Windows 资源管理器中显示、以及局部刷新。已存在的工作区文件和
  文件夹可以拖入另一个工作区文件夹，且不会覆盖。
- 监听当前工作区，标记新增、修改、删除和重命名的路径，无需重新扫描整个仓库。
- 支持键盘导航、首字母定位、宽度调整、折叠、明暗主题、减弱动效、明确的错误状态，
  以及窄窗口下的抽屉式布局。
- 对未知的 Codex 版本、有歧义的 renderer、非本地任务、非法路径以及越界的工作区访问
  一律安全失败（fail closed）。

原生桥（bridge）没有通用的 `readFile`、`writeFile`、导入、搜索、shell、凭据、模型
或任意命令操作。内容访问仅限于固定策略的预览/保存方法，文件树的变更也仅限于严格
schema、受工作区边界约束的创建、重命名、移动、删除和显示方法。

## 快捷键与文件操作

- `Ctrl+C` 复制、`Ctrl+X` 剪切、`Ctrl+V` 粘贴、`Delete` 删除选中的文件或文件夹。
- 支持多选：选中多个文件后，右键菜单中的操作会作用于整个选区。
- 粘贴时若出现同名文件，复制出的文件名会自动变为「原文件名 + copy N」，并保留扩展名。
- 复制绝对路径为即时操作（项目根路径 + 相对路径本地拼接，无需往返请求）。

<!-- PLACEHOLDER_ZH -->

## 安装（使用预编译版本）

预编译的 Windows x64 安装包位于 [`releases/v0.1.20/`](releases/v0.1.20/)，
同时也会附加在 GitHub Releases 中。完整的安装/卸载说明见
[`releases/README.md`](releases/README.md)。简而言之：下载 setup EXE，双击即可完成。
**本版本已关闭版本兼容性限制，可配合任意 Codex Desktop 版本使用。**

### 一键安装

双击 `CodeCodex-<版本>-x64-setup.exe`，或运行 `CodeCodex-<版本>-x64.msi`。两者都会以
当前用户身份安装到 `%LOCALAPPDATA%\Programs\Code-Codex`，无需管理员权限。后续升级
请使用相同的格式。

安装程序会保留名为 **Codex** 的现有桌面快捷方式，保留其官方图标，并将其重定向到
Code-Codex。它不会新增独立的桌面或开始菜单快捷方式。原始的 AppX 快捷方式会被逐字节
备份，供卸载时恢复。

### 便携 ZIP

便携 ZIP 内含 `Install-CodeCodex.exe`，解压后可一键安装；也可使用其中经审计的
PowerShell 入口脚本进行脚本化安装：

```powershell
./Install-CodeCodex.ps1
```

## 使用

安装或升级可以在 Codex 打开时进行。完成后重启 Codex，然后像平常一样从同一个桌面
快捷方式启动 **Codex**。该快捷方式现在会通过 Code-Codex 启动 Codex，因此 Codex 打开后
面板即可用，不需要额外的服务或单独的启动器。

选中一个受支持的文件，或聚焦后按 Enter，即可在 Codex 主界面打开它。顶部主题栏始终把
**Conversation** 放在第一位，并为每个打开的文件新增一个标签页，因此切回对话不会破坏
它。重新打开同一文件会复用其标签页；用标签页的关闭按钮关闭文件，或按 Escape 返回
对话。最多可同时打开 8 个文件标签页。

用标题栏的关闭按钮可以隐藏 Code-Codex 并停止其监听。在 Codex 侧栏选中或重新选中一个
本地任务即可再次显示它。

## 从源码构建

前提：Windows、Rust（stable）、Node.js 与 npm，以及带桌面 C++ 和 Windows 11 SDK 的
Visual Studio Build Tools（用于打包 MSI）。

```bash
# 1. 构建前端 bundle
cd packages/explorer-ui && npm ci && npm run build

# 2. 构建 Rust 主程序
cargo build --release --bin code-codex

# 3. 打包安装程序（Windows，PowerShell）
powershell -File scripts/package.ps1 -Version 0.1.20
```

产物会输出到 `artifacts/`。

## 卸载

无需打开 Windows 设置。以下任一方式均可：

- 运行 `%LOCALAPPDATA%\Programs\Code-Codex` 下的
  `Uninstall-CodeCodex.exe`；**或**
- 若使用 MSI 安装：照常从 **设置 → 应用** 卸载；**或**
- 打开安装目录，直接运行卸载程序。

卸载会恢复原始的 Codex 桌面快捷方式，删除所有 Code-Codex 文件，并清除「应用和功能」
中的条目。你的 Codex 安装不会受到影响。

## 安全与隐私

Code-Codex 安装在独立目录，不修改官方 Codex 文件。原生桥不提供通用的文件读写、
shell、凭据或任意命令能力；所有内容访问都通过固定策略的预览/保存方法，所有文件树变更
都受工作区边界约束并遵循严格 schema。诊断信息会对版本做脱敏处理，默认运行日志不含项目
路径和文件名。

## 许可证

本项目基于 MIT 许可证发布，详见 [LICENSE](LICENSE)。

