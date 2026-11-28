# Code-Codex v0.6.67

## 简体中文

以下是 **v0.6.57 → v0.6.67** 的累计更新。[查看完整改动](https://github.com/Rice-dog/code-codex/compare/v0.6.57...v0.6.67)

- **流体字符背景。** ASCII 字符随液面流动，可用鼠标激起涟漪。可调整字符密度、流动和开场效果，也可用作启动背景。代码独立实现，视觉参考 [React Bits Pro · Liquid ASCII](https://pro.reactbits.dev/docs/components/liquid-ascii?browse=components)。
- **文件树切换。** 在同一项目的对话之间切换时保留已展开目录。修复从已有对话切到新对话时，文件树短暂跳到窗口最左侧的问题。
- **启动动画与官方更新。** 修复启用启动动画时先露出原生加载 Logo 的问题。官方更新重开时，改进原生窗口的退出和 Code-Codex 接续启动。
- **兼容检测。** 补充文件树过渡和启动首帧检查，并记录隔离场景的逐项结果。报告区分检查异常和仍需现场验证的项目。

已核对本机安装文件与已登录窗口的接管。文件树过渡经过 Chromium 回归测试，启动首帧经过隔离的官方客户端冷启动验证。跨官方版本的完整更新重启仍待现场验证。Windows 用户可点击文件树右下角的版本号更新，或下载下方安装包并用 `SHA256SUMS.txt` 核对。

## English

Cumulative changes from **v0.6.57 to v0.6.67**. [Compare the full changes](https://github.com/Rice-dog/code-codex/compare/v0.6.57...v0.6.67)

- **Liquid ASCII background.** ASCII glyphs move with a fluid surface and ripple under the pointer. Adjust glyph density, fluid motion, and the opening effect, or use it as a startup background. Independently implemented using [React Bits Pro · Liquid ASCII](https://pro.reactbits.dev/docs/components/liquid-ascii?browse=components) as a visual reference.
- **File tree transitions.** Keep expanded directories when switching chats within the same project. Fix the brief jump to the far left when opening a new chat from an existing one.
- **Startup animation and official updates.** Prevent the native loading logo from flashing before the configured startup animation. Improve the native window exit and Code-Codex handoff when the official updater restarts the app.
- **Compatibility checks.** Check file tree transitions and the first startup frame, and record individual results from isolated scenarios. Reports identify failures and scenarios that still need live verification.

Local installed files and handoff in a signed-in window were verified. File tree transitions passed Chromium regression tests, and the first startup frame was checked in an isolated cold start of the official client. A full restart across an official Codex version update remains to be verified live. On Windows, click the version number at the bottom-right of the file tree or download an installer below and verify it against `SHA256SUMS.txt`.
