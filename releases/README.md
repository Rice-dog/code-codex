# Code-Codex v0.6.26

## 简体中文

累计更新范围：上一公开软件版本 **v0.6.20 → v0.6.26**。[完整源码比较](https://github.com/Rice-dog/code-codex/compare/v0.6.20...v0.6.26)。

- **官方更新接续**：新增官方更新交接与 Windows 包注册事件接续，修复旧进程退出早于新版注册完成时过早结束交接的问题。普通关闭或取消更新不触发更新重启；不会强行终止正在运行的官方会话。
- **独立 Runtime 更新识别**：更新报告同时记录官方桌面包与 PrimaryRuntime 注册变化，即使桌面版本未变也能识别 Runtime 更新。复用官方 MSIX 文件目录与声明的 SHA-256，减少不必要的文件读取，并区分声明指纹与本地完整性验证。
- **文件树与分栏布局**：修复文件树展开/折叠后，右侧分栏导致主对话文字及输入框被裁切的布局问题（#84 对应场景），保留单栏和全屏分栏的原生尺寸行为。
- **透明度修复**：处理输入框底部及渐变伪元素的重复黑底；PR/项目摘要、右侧 New tab 等面板复用现有“右侧工具栏”不透明度设置，支持 0–100%，保留原生控件和媒体内容。
- **可复用兼容检查**：共用背景绘制检查，覆盖元素、伪元素、重新挂载及分栏；按实际挂载状态区分通过、问题和待验收。规则更新与宿主版本更新分别记录，历史报告保持原样。

已复用本机构建、安装并热激活验证的制品，16 个安装组件逐一与包内 SHA-256 核对，29 个独立插件包保持原版本和字节。针对性本地测试及当前窗口检查通过；现场检查为 17 项通过、1 项待验收。真实官方升级、卸载及所有客户端版本组合没有全部实测；未挂载的设置页仍需单独验收。未运行 CI。

## English

Cumulative changes from the previous public software release, **v0.6.20 → v0.6.26**. [Full source comparison](https://github.com/Rice-dog/code-codex/compare/v0.6.20...v0.6.26).

- **Official-update handoff**: Added an update handoff with Windows package-registration events, fixing premature completion when the old process exits before the new package is registered. Ordinary closure or a cancelled update does not trigger an update relaunch; active official sessions are not forcibly terminated.
- **Independent Runtime detection**: Reports now track both desktop packages and PrimaryRuntime registrations, detecting Runtime updates even when the desktop version is unchanged. Official MSIX file catalogs and declared SHA-256 values reduce unnecessary file reads; declared fingerprints remain distinct from local integrity verification.
- **File tree and split panes**: Fixed conversation text and composer clipping when the file tree is expanded/collapsed with a right-hand split pane, covering the corresponding #84 scenario. Single-pane and full-view native sizing are preserved.
- **Opacity fixes**: Removed redundant black backing from composer footer layers and gradient pseudo-elements. PR/project summaries and right-hand New tab panels reuse the existing Side panel opacity setting from 0–100%, preserving native controls and media content.
- **Reusable compatibility checks**: Shared paint inspection covers elements, pseudo-elements, remounts and split layouts. Mounted evidence distinguishes passed checks, issues and manual acceptance. Rule revisions and host updates are recorded separately; historical reports remain unchanged.

Artifacts reuse the build already installed and hot-activated locally. All 16 installed components match package SHA-256 values; 29 independent plugin packages retain their versions and bytes. Targeted local tests and current-window checks passed, with 17 checks passed and one requiring manual acceptance. Real official upgrades, uninstall scenarios and every client-version combination have not all been exercised; unmounted Settings pages require separate acceptance. No CI was run.
