# Code-Codex v0.6.57

## 简体中文

以下为上一公开正式版 **v0.6.33 → v0.6.57** 的累计更新。[查看完整改动](https://github.com/Rice-dog/code-codex/compare/v0.6.33...v0.6.57)

- **新版 Codex 界面兼容。** 修复文件树与主对话的顶部对齐、折叠栏和右侧分栏的挤压裁切。调整设置页、侧面板和输入框的透明底层，避免多层底色叠加或残留黑边。
- **界面响应。** 减少打开输入框菜单时的重复布局计算，优化插件市场滚动、文件树更新及顶部子菜单的鼠标反馈。
- **背景和透明度。** 优化普通背景从底色过渡到首帧的过程。自定义背景与界面透明度适配新版原生布局，保留原有素材和参数。
- **安装和更新。** 改进已安装窗口的热更新接管以及官方 Codex 更新后的重开衔接。首次安装后提供欢迎页和快速介绍，顶部 Code-Codex 菜单可重新打开介绍。
- **兼容检测。** 将报告和重新检查归入顶部兼容分析菜单，细化原生页面、分栏、透明度、各类插件和更新入口的检查。报告保留需要实际场景验收的项目。

本机已核对安装文件，验证了已登录窗口中的文件树、背景和菜单。真实官方更新跨版本重启仍有待对应现场验证。Windows 用户可点击文件树右下角版本号更新，或下载下方安装包。下载后可用 `SHA256SUMS.txt` 校验。

## English

Cumulative changes since the previous public release, **v0.6.33 → v0.6.57**. [Compare the full changes](https://github.com/Rice-dog/code-codex/compare/v0.6.33...v0.6.57)

- **Compatibility with the newer Codex interface.** Fix alignment between the file tree and the conversation, and prevent clipping around the collapsed rail and right-side split views. Adjust native backings in Settings, side panels, and the composer to remove overlapping fills and stray dark edges.
- **Interface responsiveness.** Reduce repeated layout work when opening composer menus. Improve plugin market scrolling, file tree refreshes, and pointer feedback in the top menu.
- **Backgrounds and opacity.** Improve the transition from the base color to the first background frame. Update Custom Background and UI Surface Opacity for the newer native layout, retaining existing media and settings.
- **Installation and updates.** Improve hot activation in the running window and the handoff after official Codex updates. First-time installs present a welcome screen and quick tour, which can be reopened from the top Code-Codex menu.
- **Compatibility checks.** Group the report and recheck commands under Compatibility Analysis. Expand checks for native pages, split layouts, opacity, plugin categories, and update entry points. The report identifies scenarios that still need hands-on validation.

Installed files were verified locally, and the file tree, background, and menus were checked in a signed-in window. An end-to-end restart across a real official Codex update still needs corresponding live validation. On Windows, click the version number at the bottom-right of the file tree or download an installer below. Verify downloads against `SHA256SUMS.txt`.
