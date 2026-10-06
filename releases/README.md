# Releases

This folder contains ready-made downloadable packages.

## v0.3.89 — 补齐启动动画的图像背景来源

### 简体中文

- 启动动画新增 Particle Image Background 与 Pixel Sculpt Background，可选择全部十种动态背景；使用各背景已有参数和本地图片库。
- 独立启动/预览实例等待图像准备和真实首帧，避免空白播放；切换或关闭时释放资源，失败提供运行记录。启动副本不覆盖正常背景参数或启用选择。
- 保留背景至少展示四秒及用户设置的淡出时间。图像背景参与主背景等待/恢复，预览适配自身窗口大小。
- 本地版本；尚未发布到 GitHub。验证范围以实际浏览器回归和安装核对为准，不代表所有官方客户端或 GPU 均已实测。

### English

- Add Particle Image Background and Pixel Sculpt Background as startup sources, covering all ten dynamic backgrounds with their existing settings and local image libraries.
- Wait for image preparation and an actual first frame. Dispose independent startup/preview resources on cancellation and record failures without overwriting normal background settings or selection.
- Preserve the four-second background minimum and configured fade duration. Image backgrounds participate in main-background hold/resume; inline previews use their own bounds.
- Local version; not published to GitHub. Validation covers the recorded browser regressions and installation checks, not every official client or GPU.

## v0.3.88 — 修复启动动画来源切换后的参数面板位置

### 简体中文

- 从背景插件切换到视频时，按更新后的面板高度立即重新定位，避免下方参数超出窗口、滑块无法操作；无需关闭再打开面板。
- 保留已有视频、裁剪范围、参数值及插件预览的清理逻辑。补充持续打开面板、短/窄窗口、真实鼠标拖动和重载保存的浏览器回归检查。
- 本地版本；尚未发布到 GitHub。浏览器检查使用隔离的生产包界面，不能替代所有官方客户端版本的实测。

### English

- Reposition the open startup settings panel using its updated height when switching from a background plugin to video. Lower controls remain within the viewport and can be adjusted without closing and reopening the panel.
- Preserve the selected video, clip range, parameter values and preview cleanup. Add browser regression checks for an open panel, short/narrow windows, real mouse dragging and persisted values after reload.
- Local version; not published to GitHub. Browser checks use an isolated production-bundle UI and do not establish compatibility with every official client version.

## v0.3.87 — Recover uncertain imports and sanitize runtime logs

- Re-read the original destination after a failed commit response without replaying the import. Guard reconciliation across workspace changes and distinguish failed refreshes from successful reads.
- Sanitize runtime events before renderer synchronization and native storage. Apply the same policy when reading, copying or exporting older logs; retain diagnostic codes, counts and timing.
- Add fault-injection regression tests covering lost commit responses, refresh failures, workspace changes, rejected commits, pre-commit failures, nested secrets, queue restoration and historical exports.

## v0.3.86 — Preserve background openings beneath startup animation

- Main backgrounds prepare an initial frame while covered, then hold playback until the startup animation fully finishes. Opening clocks restart before playback resumes.
- Startup backgrounds and settings previews continue independently. Hold, preparation, release and reset errors are included in runtime information.

## v0.3.85 — Native Codex readiness without plugin handoff

- Startup fade depends on visible native Codex content and one second of stable frames. It no longer waits for Code-Codex UI mounting.
- Minimum display and fade settings remain unchanged; readiness evidence, stalls and explicit compatibility fallbacks are recorded.

## v0.3.84 — Content and frame stability readiness

- Startup fade now waits for visible native content, full UI mounting handoff, and one second of stable frames, rather than the presence of shell elements alone.
- Long tasks and frame stalls restart the stability check. Background minimum display and configured fade, and video timing, remain unchanged.
- Runtime information records readiness evidence, long tasks, resets, success and bounded compatibility fallbacks. Current official internal phase state is not directly exposed, so the visible-content fallback is explicitly identified.

## v0.3.83 — Background startup fade and centered transport

- Background startup retains its four-second minimum and readiness gate, then fades into Codex over a separately configurable duration (default one second).
- Video transport controls stay centered within the timeline header; the clip duration stays at the right.

## v0.3.82 — Simplified startup animation controls

- Background startup mode only requires selecting a plugin; its preview starts automatically and keeps running while the panel is open.
- Background startup displays for at least four seconds, waits for Codex readiness, then exits immediately; video timing parameters do not affect background mode.
- Localized source choices and one source label. Video timeline label, time and borderless transport controls now share one compact row.

## v0.3.81 — Background plugins as startup animations

- Choose Video or Background plugin in Codex Startup Transition; keep the selected video when switching sources.
- Reuse eight existing independent renderers and their saved settings without changing the normal background's enabled state.
- Preview background startup, keep minimum-display and readiness-driven fade, and log the chosen source and renderer lifecycle.
- A background timing reference defines the percentages while the effect continues until Codex is ready.

## v0.3.80 — Remove startup video opacity control

- Remove Video opacity from startup transition settings and fix video opacity at 100%.
- Ignore legacy saved opacity values in both playback and preview; preserve the readiness-driven fade.

## v0.3.79 — Fade from the current frame when ready

- Once native readiness and minimum visibility are satisfied, fade immediately from the current playback position.
- Measure fade duration from the selected clip percentage; continue video playback across clip boundaries until fade completes.
- Log readiness timing, remaining minimum visibility and fade trigger position/duration.

## v0.3.78 — Loading-screen animation supervision

- Supervise the optional startup player concurrently from activation through page discovery and navigation.
- Keep the new-document hook connected; show only the selected video during loading and fade after native readiness.
- Record candidate selection, ownership checks, CDP command failures, player state, video lookup and renderer lifecycle in Runtime Information.
- Preserve normal startup and the existing 10-run, 5 MiB per-run log limits.

## v0.3.77 — Runtime Information

- Add the English Runtime Information item to the Code-Codex menu, with run selection, event filtering, Copy Details and JSONL export.
- Reuse startup traces and collect renderer supervision, file-tree/project/preview activity, plugin state/settings, startup video lifecycle and observable native Codex page changes.
- Automatically retain the latest 10 runs. Each JSONL file is capped at 5 MiB; oldest complete events are removed in batches and the removed count remains visible.
- Write asynchronously with atomic file replacement, bounded renderer batches and retry after temporary connection loss. Logs stay local under `%LOCALAPPDATA%\CodeCodex\runtime-logs`.
- Validated with Rust storage/retention tests, a native failed-launch persistence check, browser interaction/export/retry checks and existing UI regression checks.
- Local build, not published to GitHub.

## v0.3.76 — Earlier loading-screen animation

- Start the lightweight animation immediately after official package activation, before the slower CIM check and App Server preparation.
- Use a native TCP-owner and process-creation-time check for this capability-free early phase; full identity checks and privileged UI qualification remain in place.
- A main container alone no longer means ready: the native navigation/sidebar or actual sign-in controls must be present.
- Show the first decoded frame immediately: the tail-fade percentage no longer creates a long entrance fade.
- Detect readiness within the early player, preserve video/trim/percentage settings, and suppress late replay.
- Local build, not published to GitHub.

## v0.3.75 — Animation during the loading screen

- A separate 8.5 KB, bridge-free startup bundle runs on the verified official main loading document before App Server preparation and shell qualification.
- The full UI adopts the same player and readiness promise; it does not replay an opening animation after the main interface appears.
- Late loading skips animation. Existing video selection, trim, percentage timing and preview controls are preserved.
- Added loading-page to ready-page handoff and late-replay regression checks.
- Local version, not published to GitHub.

## v0.3.74 — Percentage timing and readiness-based playback

- Removed the maximum-wait control and startup timeout; the selected clip loops until Codex is ready.
- Minimum display and tail fade now use 0–100% of the selected clip. Changing trim or playback speed preserves these proportions.
- Preview, timing markers and actual startup share the same clip proportions; legacy saved milliseconds migrate automatically.
- Readiness detection continues through slow startup; video decoding or playback errors dismiss the animation instead of blocking the app.
- Validated and installed locally; not published to GitHub.

## v0.3.73 — 裁剪片段尾部淡出 / Fade within the trimmed clip

- 预览及实际启动的淡出作用于所选片段的尾部，视频在淡出期间继续播放，在片段终点结束，不再追加静止末帧淡出。
- 参数范围细线以裁剪起点为零点、裁剪片段长度为尺度；超过片段长度的标记收束在片段边界。
- 范围条减为 3px 细线，移除固定标题和颜色标签；各颜色提供悬停及键盘焦点可访问的效果与时间说明。
- 保留播放、暂停、跳转、拖动与空格控制；最短显示超出片段播放时长时，在开头等待后再完整播放及尾部淡出。
- 本地版本，尚未发布至 GitHub。

## v0.3.72 — 剪辑式播放控制 / Timeline transport controls

- 时间轴区域使用深黑灰背景；其上方加入片段开头、播放/暂停及片段末尾按钮，移除重播选项。
- 播放从当前指针继续，空格切换播放与暂停；拖动定位或跳转重置模拟计时，关闭面板停止播放。
- 预览模拟启动：片段结束视为就绪，满足最短显示时长后淡出；达到最长等待时间则停止播放并淡出。暂停同时冻结视频、等待和淡出，参数实时生效。
- 增大参数两列之间的空隙，缩短参数说明与滑条距离，保留统一字体、控件和窄屏单列布局。
- 本地版本，尚未发布至 GitHub。

## v0.3.71 — 启动视频时间轴播放 / Startup video timeline playback

- 按住时间轴拖动即可连续定位视频画面；拖出时间轴仍可定位两端，播放指针同步更新。
- 重播从选中片段起点播放到终点并停留在末帧，不受启动等待和淡出参数截断；拖动暂停定位，再次重播返回片段起点。
- 打开设置只显示视频首帧，关闭面板停止播放；移除启动器和播放器内置默认动画，没有自选视频时不播放动画。
- 保留统一设置样式、宽屏预览、双列参数和窄屏排列。
- 本地版本，尚未发布至 GitHub。

## v0.3.70 — 加宽启动动画设置 / Wider startup transition settings

- 启动动画设置面板加宽至 800px，上方视频预览和时间轴使用整行宽度。
- 视频外观及播放时长使用双列参数排列；窄窗口下自动恢复单列，保留统一字体、颜色、控件和中英切换。
- 保留动画插件的市场入口、已有设置及预览行为。
- 本地版本，尚未发布至 GitHub。

## v0.3.69 — 恢复启动动画市场入口 / Restore startup transition entry

- 在 Preview Market 的 Appearance 中重新显示 Codex Startup Transition，保留其已有启用状态与动画设置。
- 保留 v0.3.68 的蒙版调节、双语面板、消息提示及登录页背景行为。
- 本地版本，尚未发布至 GitHub。

## v0.3.68 — 蒙版面板样式和提示层级 / Consistent opacity controls and visible notices

- 市场名称固定为英文 UI Surface Opacity；设置面板复用其他外观插件的中英语言开关、标题、参数行、字体和按钮样式。
- Enable 仅切换启用状态；没有背景时只显示提示，不打开设置面板。调节按钮独立负责打开和关闭面板。
- 操作提示使用顶层弹层，显示在 Preview Market 及已有设置面板之上，按可视区域定位，保留原有自动消失和读屏提示。
- 浏览器验证覆盖提示真实可见、中英文切换、共享字体、按钮行为，以及已有蒙版和登录背景回归。

## v0.3.67 — 分区蒙版调节与登录页背景 / Surface opacity and sign-in backgrounds

- 在 Appearance 第一位加入界面蒙版不透明度插件，分别调节导航栏、任务与项目选择栏、文件树、对话区、文件预览、标签栏、输入框、右侧工具栏和登录页；设置实时生效并自动保存，可单项或全部恢复默认值。
- 启用前检查是否已有背景插件；没有背景时弹出提示。关闭背景后暂停调节，再次启用背景时恢复设置，不改变文字和图标的透明度。
- 登录和账号退出页面隐藏文件树，不占用原生登录页空间；保留当前背景，直接从登录页启动也能恢复已保存的背景。
- 原生登录页按官方布局识别，兼容中英文，保留官方来源、窗口唯一性等启动校验。
- Codex Startup Transition 仅从预览市场隐藏，保留代码和已有设置。
- 本地版本，尚未发布至 GitHub。

## v0.3.66 — Home 文件树保留与市场按钮状态 / Home-only explorer and consistent plugin toggles

- 文件树仅在 Home 显示；切到 Scheduled、Library、Images 或设置时完全隐藏，不转为抽屉，也不占用原生页面空间。
- 离开 Home 时保留项目连接、文件监听、目录展开、滚动位置、文件预览和编辑草稿；切回同一项目直接恢复。原生 Home 缓存被移除后也可恢复；真正更换项目仍按原有流程读取。
- 适配原生设置页替换整行布局且不提供侧栏按钮的情况；保留结构和官方来源校验，避免正常切页被误判并断开连接。
- 外观插件的启用按钮统一复用现有已启用样式；使用 `aria-pressed` 状态的新插件也自动获得相同样式。
- 浏览器回归覆盖页面切换、Home 缓存移除、离开期间文件变化、草稿保留、真实项目切换，以及所有外观插件在明暗主题下的按钮样式。

## v0.3.64 — 隐藏启动动画市场入口 / Hide startup transition in Preview Market

- 仅隐藏预览市场中的 Codex Startup Transition 入口，保留插件代码与已保存设置；保留 v0.3.63 的布局适配修复。

## v0.3.63 — Codex 26.928 布局适配 / Current page layout compatibility

- 识别新版的活动页与缓存页；启动检测、文件树、对话名称和文件预览统一跟随活动页，保留旧布局。
- 项目切换时更新文件树挂载和顶部标题位置，避免侧栏重叠；新版缓存页不再依赖入场动画完成才显示文件树。
- 清除动态背景下重复叠加的侧栏蒙版、顶部渐变和底部实体背景，保留原有对话蒙版与输入框背景。
- 先展示项目根目录再建立递归监听，监听建立后补读一次，兼顾首次读取速度和变化同步。
- 布局诊断增加总主界面数、缓存主界面数和活动页数；新增浏览器回归覆盖缓存页切换、预览透明度、点击恢复和延迟监听。

## v0.3.62 — 恢复 Codex 启动过渡插件 / Restore startup transition

- 在插件市场的 Appearance 类别中重新显示 Codex Startup Transition。
- 启用后，启动器按已保存的设置显示启动等待动画；默认仍为关闭。

## v0.3.61 — 布局不匹配诊断增强 / Detailed renderer layout diagnostics

- `CC-START-CDP-014` 明确说明已找到 Codex 页面、但其布局不匹配；提示 Codex 更新或窗口模式改变均可能导致此现象，而不武断归因。
- `Copy details` 增加逐条校验的预期值与实际值、失败规则、限定深度的脱敏节点关系、文件树挂载状态，以及候选窗口加载、布局探测和注入脚本的过程记录。
- 所有新增信息均有数量上限；不采集对话文字、标题、原始类名、页面 URL 查询参数或本地路径。

## v0.3.60 — 修复嵌套 Workspace 布局 / Nested workspace layout compatibility

- 根据 v0.3.59 的实机诊断，修正 Workspace 并非布局行直接子节点时的误判；定位唯一包含对话主界面的直接子节点，并校验它位于左侧栏之后。
- 文件树注入使用同一结构判断；回归测试覆盖旧布局、普通对话、多标签和嵌套 Workspace，以及错误结构的拒绝行为。

## v0.3.59 — Codex 常规对话布局兼容 / Regular conversation layout compatibility

- 修复 Codex 26.924.2738.0 常规对话界面缺少条件性 `data-app-shell-unified-tab-strip` 属性时，误报 `CC-START-CDP-014` 且不显示文件树的问题。
- 启动识别和文件树挂载统一校验真实 Workspace、左侧栏、主界面的层级关系；保留旧版布局和多标签页布局识别。
- 诊断报告将真实 Workspace 数量与可选的标签栏属性数量分开列出，便于后续排查。

## v0.3.58 — 全路径启动诊断 / Startup diagnostics for every captured failure

- 修复 v0.3.57 中部分 `CDP-001` 仍只有一句笼统原因的问题：统一记录启动阶段、耗时、进程及端口状态。
- 监控期间被动保存 CDP 页面发现次数、最后一次页面数、筛选结果和 renderer 会话错误；端口关闭后仍可从 `Copy details` 查看。
- 保留只读页面布局逐项校验，未改变窗口匹配、注入及正常启动行为；此版本先在本地生成，尚未发布至 GitHub。

- All captured startup failures now include a bounded phase timeline and available process/port observations, including late CDP endpoint loss.
- Passive CDP progress survives endpoint shutdown; Copy details includes the last discovery and renderer session outcome.
- Renderer matching and injection behavior remain unchanged. This build is local and has not been published to GitHub.

## v0.3.57 — 启动诊断增强 / Startup diagnostics

- 基于 v0.3.52 的现有匹配和注入逻辑，补充启动阶段耗时、进程状态及候选页面逐项校验结果；`Copy details` 会包含这些信息。
- 诊断只记录布尔值、计数及经过清洗的页面位置，不复制页面正文、标题或 URL 查询参数。
- 此版本先在本地生成，尚未发布至 GitHub。

- Keeps v0.3.52 renderer matching and injection behavior while adding startup timings, process state, and per-candidate qualification results to Copy details.
- Reports only booleans, counts, and sanitized page locations, without page text, titles, or URL queries.
- Built locally first; not yet published on GitHub.

## v0.3.52 — 安装与界面适配 / Setup and interface improvements

- 修复旧版安装记录仍在、`Code-Codex.lnk` 已丢失时，升级在保存快捷方式回滚状态阶段失败的问题。升级会重建可用快捷方式，失败回滚仍保留原安装记录与缺失状态。
- 安装错误窗口保留快捷方式工具的具体错误文本，避免只显示笼统的回滚准备失败信息。
- 打开文件预览时，动态背景继续透过与对话区一致的半透明蒙版显示。
- 顶部 Code-Codex 菜单不再依赖英文菜单标签，会出现在原生菜单项右侧。
- 重新打开插件市场或切换分类时，自动定位到该分类中已启用的插件。

- Upgrades now recreate a missing managed `Code-Codex.lnk` while preserving the prior missing-shortcut state if installation rolls back.
- Setup errors retain the shortcut tool's specific failure output.
- File previews use the same translucent mask as the conversation area when a dynamic background is active.
- The top Code-Codex menu no longer depends on English menu labels and appears after the native menu items.
- Preview Market reveals an enabled plugin when opened or when switching categories.

## v0.3.48 — 本地诊断与安装修复 / Local diagnostics and setup fixes

- 启动时从官方 Windows 安装包清单识别主程序，并在进程校验中比较规范化路径及文件身份；不放宽非官方进程拦截。
- 启动报告分别列出预期和实际程序的文件名及 WindowsApps 包目录名，便于一次反馈定位路径差异。
- 安装器对短暂文件占用做有限重试，失败时显示步骤、操作、文件名、HRESULT、Win32 错误码和可读的原始错误；回滚快捷方式与版本标记，并在成功前校验安装文件和快捷方式。

- Read the official Windows package manifest to select its application executable, and compare canonical paths and file identity without weakening nonofficial-process checks.
- Startup reports show the expected and observed executable and WindowsApps package names.
- Setup retries transient file sharing errors, reports the operation and OS error codes without garbled text, rolls back shortcut/version state on failure, and verifies files and shortcut before success.

## v0.3.47 — 新版 Codex 适配 / New Codex Layout Compatibility

- 新版 Codex 布局在原生 New Tab 分栏时，文件预览跟随 Codex 对话视口移动到右侧，保留左侧原生网页面板及其交互；对话与文件标签仍保持 42px 高度、选中灰色、其余白色。旧版布局保持原样。
- 修复 Windows 桌面缓存旧版 Code-Codex 图标的问题：官方白色 Codex 图标使用新的图标文件路径，并在替换快捷方式后刷新 Shell 图标缓存。
- 桌面快捷方式恢复使用官方 Codex 安装包中的白色图标；快捷方式仍启动 Code-Codex。安装和升级时会重新生成多尺寸图标。
- 根据 Codex 26.924.2738.0 的实际界面结构，修复启动时 `CC-START-CDP-014` 和文件树不显示的问题；文件树位于任务选择栏与对话区域之间。旧版本仍使用原有布局路径。
- 新版布局中，会话标题随文件树宽度移动，文件树顶部与原生侧栏及会话区域齐平；修复新版外观接口变化导致动态背景插件无法启用的问题。
- 打开文件预览时，首个标签显示当前对话名称，并隐藏重复的原生标题；标签位置与新版 Codex 标题栏对齐，关闭预览后恢复原生标题。旧版布局保持原样。
- 提供 setup EXE、MSI、ZIP、独立卸载程序和 `SHA256SUMS.txt`。

- In the new Codex layout, file previews now follow Codex's native conversation viewport into the right pane when New Tab creates a split view, preserving the native web pane on the left. Tabs retain their 42px height and selected-gray/unselected-white appearance. The legacy layout is unchanged.
- Fixes Windows continuing to show the old Code-Codex shortcut icon from its cache. The official white Codex icon now has a new file path, and setup refreshes the Shell icon cache after replacing the shortcut.
- The desktop shortcut uses the white icon from the official Codex package again while still launching Code-Codex. Installation and upgrades regenerate the multi-resolution icon.
- Uses the actual Codex 26.924.2738.0 interface structure to fix `CC-START-CDP-014` and restore the file tree between the task sidebar and conversation. Earlier versions retain their existing layout path.
- On the new layout, the conversation title tracks the file tree width and the panel aligns with the native content area. Dynamic backgrounds can again use Codex's appearance controls.
- File previews show the current conversation name in the first tab and suppress the duplicate native title. The tab aligns with the new Codex title bar, and closing the preview restores the native title. The legacy layout is unchanged.
- Includes the setup EXE, MSI, ZIP, standalone uninstaller, and `SHA256SUMS.txt`.

## v0.3.31 — 桌面快捷方式接管 / Desktop Shortcut Adoption

- 安装器会复用当前用户或公共桌面上的 Codex/ChatGPT 快捷方式，包括用户自行创建或重命名的快捷方式；只有找不到可接管的快捷方式时才新建 Code-Codex 图标。
- 被接管的快捷方式使用 Code-Codex 图标；安装完成时显示实际快捷方式路径，卸载时恢复原始快捷方式。升级迁移和安装回滚也保留原始快捷方式。
- 提供 setup EXE、MSI、ZIP、独立卸载程序及 SHA-256 校验文件。

- Setup reuses a Codex/ChatGPT shortcut on the user's or shared desktop, including user-created or renamed shortcuts; it creates a separate Code-Codex icon only when none is suitable.
- The managed shortcut uses the Code-Codex icon. Setup identifies its path, and uninstall restores the original shortcut; upgrade rollback also preserves it.
- Includes the setup EXE, MSI, ZIP, standalone uninstaller, and SHA-256 checksums.

## v0.3.26 — 启动错误分类与诊断 / Startup Error Classification and Diagnostics

- 将不同的 CDP 连接、窗口识别、进程校验、Codex 启动及工作区错误分配到更具体的支持代码，避免多种原因共用一个代码。
- 进程校验报告提供监听端口、PID、进程关系、路径可用性和安装位置类别；Codex 启动失败显示失败阶段及安全的系统错误信息。报告不包含完整可执行文件路径。
- 提供 setup EXE、MSI、ZIP、独立卸载程序及 SHA-256 校验文件。

- CDP connection, window discovery, process verification, Codex launch, and workspace failures now have more specific support codes instead of sharing broad codes.
- Process reports include the listener port, PIDs, ancestry, path availability, and installation-location category. Launch failures show their stage and safe OS error details without full executable paths.
- Includes the setup EXE, MSI, ZIP, standalone uninstaller, and SHA-256 checksums.

## v0.3.23 — 启动诊断与安装体验 / Startup Diagnostics and Installer Experience

- 启动失败报告记录本次启动的 CDP 端点探测、等待时间、进程状态和可用窗口信息，便于定位无法连接或找不到兼容窗口的问题。
- 安装与卸载进度窗口增加清晰的 Code-Codex 图标、标题栏版本号和阶段说明；改进 Codex 仍在运行时的卸载流程。
- 提供 setup EXE、MSI、ZIP、独立卸载程序及 SHA-256 校验文件。

- Startup reports now include observations from the actual CDP connection attempt, including the endpoint, wait duration, process state, and available window targets.
- Setup and uninstall progress windows show a sharp Code-Codex icon, the version in the title bar, and clearer stage details. Uninstall handling is improved while Codex remains open.
- Includes the setup EXE, MSI, ZIP, standalone uninstaller, and SHA-256 checksums.

## v0.3.8 — 闪烁方块背景 / Blinking Squares Background

- Preview Market 新增 Blinking Squares Background：全窗口方向渐隐方块、独立闪烁、鼠标交互与点击脉冲、输入时的随机键盘波纹，以及可调的波纹上限和冷却时间；提供中英文设置。
- 修复项目会话中背景插件被对话框后方深色矩形遮挡的问题。
- 提供更新后的 setup EXE、MSI、ZIP、独立卸载程序和 SHA-256 校验文件。

- Preview Market now includes Blinking Squares Background, with directional twinkling squares, pointer and click effects, random waves while typing, and bilingual controls for the wave limit and cooldown.
- Fixes the dark rectangular occlusion behind the composer in project conversations when background effects are enabled.
- Updated setup EXE, MSI, ZIP, standalone uninstaller, and SHA-256 checksums are included.

## v0.3.2 — 启动发现诊断增强

- 启动时区分官方 Codex 包未注册、仅安装 Beta、包身份异常、安装目录不可访问及主程序缺失等原因，并自动重试短暂失败的包查询。
- 失败报告增加 PowerShell 退出码、Windows HRESULT、错误 ID／类别和文件访问的 Win32 错误码；复制详情时过滤完整用户路径。
- 提供更新后的 setup EXE、MSI、ZIP 和 SHA-256 校验文件。

## v0.3.1 — 修复 MSI 安装错误 1722

- 修正 MSI 快捷方式自定义操作的安装目录参数；此前 Windows 会错误解析结尾反斜杠与引号，导致安装程序退出并显示 1722。
- setup EXE、MSI、ZIP 和 SHA-256 校验文件已同步更新。

## v0.3.0 — 顶部菜单与启动诊断

- 在 Codex 顶部 Help 右侧增加 Code-Codex 菜单，可显示或隐藏文件树、打开 Preview Market、检查 GitHub 更新并访问项目仓库；菜单样式与原生 Help 菜单保持一致。
- 启动失败时显示具体失败阶段、支持代码、原因和处理建议，并提供脱敏诊断报告。
- 版本号更新为 v0.3.0，提供 setup EXE、MSI、ZIP、独立卸载程序和 SHA-256 校验文件。

## v0.2.59 — 顶部菜单样式统一

- Code-Codex 下拉菜单对齐 Codex 原生 Help 菜单的字号、行距、宽度、背景、阴影、圆角和分组间距。

## v0.2.58 — 菜单访问 GitHub 仓库

- 顶部 Code-Codex 菜单新增 **Open GitHub Repository**，可直接访问项目的 GitHub 仓库。

## v0.2.57 — 菜单检查更新

- 顶部 Code-Codex 菜单新增 **Check for Updates…**，与点击文件树底部版本号使用同一 GitHub 检查及更新确认流程。

## v0.2.56 — 顶部 Code-Codex 菜单

- 在 Codex 顶部 Help 右侧增加 Code-Codex 菜单，可显示或隐藏文件树，并打开 Preview Market。

## v0.2.55 — 启动错误诊断

- 启动失败弹窗显示具体阶段、支持代码、底层原因和建议操作，不再只显示笼统的 App Server 错误。
- 自动生成脱敏诊断报告，支持一键复制详情或在文件资源管理器中打开报告；仅保留最近 10 份启动报告。

## v0.2.53 — Git History 跟随会话切换

- 切换会话时自动清除旧仓库节点并加载当前会话的 Git 历史，无需关闭后重新启用插件。

## v0.2.52 — Tools 分类固定滚动滑块

- Tools 分类显示不可拖动的满格滚动滑块，与可滚动分类保持视觉一致。

## v0.2.51 — Preview Market 分类栏宽度调整

- 分类栏按按钮总宽度收缩，减少 Tools 右侧多余空白。

## v0.2.50 — Preview Market 分类按钮紧凑布局

- 三个分类按钮按文字宽度自适应，并统一缩小左右间距。

## v0.2.49 — Preview Market 分类按钮等宽

- 将 Appearance、File Preview 和 Tools 三个分类按钮调整为相同宽度。

## v0.2.48 — 功能文档分类调整

- 将功能介绍精简为核心功能、插件、更新与兼容三类，并按 Preview Market 的实际分类整理详细插件说明。

## v0.2.47 — Git 分支栏视觉调整

- 在不改变分支栏高度的情况下增大分支名称字号，并为面板顶部增加圆角边框。

## v0.2.46 — Preview Market 高度统一

- 统一三个插件分类的内容区高度，内容较少的分类以空白补齐，避免切换时弹窗高度跳变。

## v0.2.45 — Preview Market 分类切换

- 精简 Preview Market 标题栏，并增加 Appearance、File Preview、Tools 分类切换，每次打开默认显示 Appearance。

## v0.2.44 — Git 提交差异预览

- 移除提交文件行右侧的展开箭头，点击文件名会在主界面标签页中显示带增删颜色的提交差异。

## v0.2.43 — Git History 返回按钮调整

- 将提交详情返回按钮移到分支栏的刷新与关闭按钮之间，并改为紧凑的左箭头图标。

## v0.2.42 — Git History 分支栏布局修复

- 修正分支栏与提交记录重叠的问题，使分支栏固定为提交记录区域最上方的独立行。

## v0.2.41 — Git History 分支栏拖动

- 将面板高度拖动区域合并到分支名称栏，并缩小分支栏上下间距。

## v0.2.40 — Git History 工具栏合并

- 移除 Git History 独立标题栏，将分支名称、刷新按钮和关闭按钮合并到同一行。

## v0.2.39 — Git History 界面细节优化

- 缩短 Git History 标题栏的纵向间距，使面板更紧凑。
- 移除提交详情中与标题重复的灰色提交说明。

## v0.2.38 — 从 Git History 打开文件

- 点击 Git History 中的变更文件可按文件树相同的方式在主对话区域打开文件标签页。
- 差异展开保留为右侧独立按钮，删除文件保持不可打开但仍可查看提交差异。

## v0.2.37 — 可调整高度的 Git History

- 移除 Git History 面板中的 “Developer Tools” 与 “Read only” 文案，保持界面简洁。
- 面板上边缘支持拖动调整高度，并保留默认占文件树下方三分之一的布局。
- 略微增大提交记录、元数据和差异内容字号，提高可读性。

## v0.2.36 — 只读 Git History

- Preview Market 新增 Git History 工具，可查看当前项目的分支、提交记录、提交详情与变更文件。
- 启用后固定显示在文件树下方三分之一的区域，关闭后恢复完整文件树。
- 支持按文件展开统一 diff，并对长历史分页加载。
- Git 调用使用固定只读参数、禁用交互与可选锁，不提供提交、暂存、分支切换或其他写入操作。

## v0.2.30 — Pixel Sculpt 统一变形渲染

- 静止与图片切换统一使用同一套顶点着色路径，消除两种状态之间的材质与几何跳变。
- 图片方块按空间位置配对，不再按压缩后的数组序号跨区域移动。
- 移除背景时，近黑背景方块不再参与跃升；切换中的侧面亮度保持实体感。
- 方块通过实体缩放出现和消失，不再使用会写入深度的半透明过渡。

## v0.2.29 — Pixel Sculpt 切换重影修复

- 不再为了对齐不同图片的方块数量而绘制重叠的重复棱柱，消除切换首尾的黑影与深度冲突。
- 新增棱柱按实体比例缩放的出生与消失过程，切换过程中保持实体材质而非半透明阴影。
- 最后一帧仍由变形着色器完整绘制，再无缝交给静态着色器。

## v0.2.28 — 粒子图片明暗闪变修复

- 新旧源图在隔离图层内使用加亮合成，黑色背景不再覆盖并压暗正在退出的主体。
- 以互补透明度直接混合两张图，消除切换开始与结束时“实体—黑影—实体”的材质跳变。
- 保留粒子弹簧运动、图片顺序和用户参数逻辑不变。

## v0.2.27 — 粒子图片成形连续性修复

- 按实际屏幕位移计算弹簧收敛终点，最大剩余偏移低于 0.05 CSS 像素后才进入静态状态。
- 同时限制终点剩余速度，避免大量粒子在成形末尾同步停止时产生可见闪变。
- 保留最终弹簧帧后再切换静态网格，使透视状态与最终图像连续衔接。

## v0.2.26 — 粒子图片切换终帧修复

- 按浏览器实际的 source-over 合成规则补偿新旧源图透明度，保持有效亮度连续。
- 移除变形首尾对粒子生命周期透明度的额外干预，避免粒子密度产生脉冲。
- 在关闭变形着色器之前先绘制最终弹簧状态，消除成形末尾跳到静态网格的透视突变。

## v0.2.23 — 即时启用桥接加固

- 安装后即时启用会把绑定名称与通知接收器明确传入当前界面，避免重复连接时沿用旧通道。
- 保持单一文件树实例，并继续支持无需重启 Codex 的版本替换。

## v0.2.22 — 安装后即时启用

- 新版本安装完成后，可在当前已打开的 Codex 窗口中自动替换 Code-Codex，无需重启 Codex。
- 本地安装与版本号更新使用同一套安全的实时启用流程。
- 独立校验正在运行的官方 Codex 调试端点，并隔离新旧版本的桥接通道。

## v0.2.21 — Pixel Sculpt 图片库与禁用态设置

- 插件未启用时也可打开并调整完整参数面板，设置会在下次启用时生效。
- 图片库改为按点击顺序加入播放队列，并支持清除顺序、紧凑编号与按队列前后切换。
- 图片库缩略图直接显示原始颜色，不再应用灰度处理。

## v0.2.20 — Pixel Sculpt 设置面板统一

- Pixel Sculpt 参数面板改用 Particle Image Background 的滑杆、按钮、开关、间距与分组视觉规范。
- 本地图片库改为一致的三列缩略图布局、选中状态、顺序标记和删除按钮样式。
- 保留原有渲染、交互、图片切换及参数逻辑。

## v0.2.19 — 启动修复（本地集成）

- 修复 Pixel Sculpt 默认图片使 UI 包超过旧限制后，Code-Codex 无法启动的问题。
- 保留有界的 UI 包大小校验，并为后续背景资源预留安全空间。

## v0.2.18 — Pixel Sculpt Background（本地集成）

- 图片立体像素浮雕背景、中英文二级设置与本地图片库。
- 原生深色外观、自动变形切换及暂停／重置。

## v0.2.16

Project Adjustments

## v0.2.15 — Cloud Train 原位分层淡入（本地集成）

- 去除开场上下位移，各层在原位依次通过透明度显现。
- 正确合成前后云层，保留原有开场参数。

## v0.2.14 — Cloud Train 分层开场（本地集成）

- 开场改为天空、远近云层、列车桥梁、前景云层按景深错峰显现。
- 保留时长、羽化宽度、开关和重播；动画结束后保持原有场景。

## v0.2.13 — Cloud Train 开场动画（本地集成）

- 新增柔和展开的开场、开关、时长和羽化宽度，支持重播及减少动态效果偏好。
- 默认 3 秒，结束后恢复原画面，不影响列车速度设置。

## v0.2.12 — Cloud Train Background（本地集成）

- 新增云海、蒸汽列车及桥梁背景，支持中英文场景与颜色参数。
- 支持暂停、重置、重播、原生深色模式及停用恢复。
- 原着色器署名 mdb；来源项目未附再分发许可，公开发布前需确认授权。

## v0.2.11 — 极光颜色调节

- Aurora Ionosphere 新增极光色相（−180°～180°）与饱和度（0～2 倍）参数。
- 支持中英文标签、手动输入、保存及重置；默认配色不变，天空和星尘不受影响。
- 本地安装包：`CodeCodex-0.2.11-x64-setup.exe`（另提供 MSI、ZIP 和独立卸载程序）。

## v0.2.10 — 山峦开场动画

- Layered Mountain Background 新增约 3 秒的由远及近开场动画，可通过“重播”再次播放。
- 开场结束后恢复原有山峦画面，系统减少动态效果模式会跳过开场。
- 中英文 README 新增山峦背景截图。
- 本地安装包：`CodeCodex-0.2.10-x64-setup.exe`（另提供 MSI、ZIP 和独立卸载程序）。

## v0.2.9 — Layered Mountain Background

- 新增 Layered Mountain Background：动态层叠山峦、暖色逆光与雾气背景。
- 提供中英文参数面板、质量预设、暂停与重置，沿用自动深色外观及停用恢复机制。
- GitHub 默认首页改为中文，英文说明通过首页顶部 English 链接访问。
- 推荐安装包：`CodeCodex-0.2.9-x64-setup.exe`。
- 同时提供 `CodeCodex-0.2.9-x64.msi`、`CodeCodex-0.2.9-x64.zip` 和 `Uninstall-CodeCodex.exe`。
- 本目录仅保留最新安装包；历史版本请访问 [GitHub Releases](https://github.com/Rice-dog/code-codex/releases)。

## v0.2.3

- `CodeCodex-0.2.3-x64-setup.exe`: recommended installer.
- `CodeCodex-0.2.3-x64.msi`: MSI installer.
- `CodeCodex-0.2.3-x64.zip`: portable package, including
  `Install-CodeCodex.exe` and `Uninstall-CodeCodex.exe`.
- Expands the seven Heavenly Cloud turbulence octaves into compile-time shader
  expressions and reconstructs the three-channel spectrum from one sine and
  one cosine calculation per ray step.
- Preserves all quality presets, ray counts, turbulence layers, parameters,
  timing, and the perceived cloud appearance.

## v0.2.2

- `CodeCodex-0.2.2-x64-setup.exe`: recommended installer.
- `CodeCodex-0.2.2-x64.msi`: MSI installer.
- `CodeCodex-0.2.2-x64.zip`: portable package, including
  `Install-CodeCodex.exe` and `Uninstall-CodeCodex.exe`.
- Optimizes Heavenly Cloud rendering by removing redundant shader calculations,
  repeated WebGL state uploads, and forced pointer-event layout measurements.
- Keeps the ray steps, turbulence layers, resolution, colors, timing, pointer
  response, and visible rendering formulas unchanged.

## v0.2.1

- `CodeCodex-0.2.1-x64-setup.exe`: recommended installer.
- `CodeCodex-0.2.1-x64.msi`: MSI installer.
- `CodeCodex-0.2.1-x64.zip`: portable package, including
  `Install-CodeCodex.exe` and `Uninstall-CodeCodex.exe`.
- Adds the Heavenly Cloud Background plugin with a textureless, real-time
  celestial cloud tunnel, pointer steering, cinematic opening controls, three
  quality levels, and bilingual settings.
- Reuses the existing full-window background surface and automatically switches
  Codex to Dark appearance, restoring the previous appearance when disabled.

## v0.2.0

- `CodeCodex-0.2.0-x64-setup.exe`: recommended installer.
- `CodeCodex-0.2.0-x64.msi`: MSI installer.
- `CodeCodex-0.2.0-x64.zip`: portable package, including
  `Install-CodeCodex.exe` and `Uninstall-CodeCodex.exe`.
- Adds the Glow Horizon Background plugin with four directions, wheel-driven
  deformation, inertial release and return controls, configurable glow colors,
  bilingual settings, and automatic Dark appearance management.
- Uses the selected Bottom-direction parameter profile as the default.
- Includes GPU and animation-loop optimizations for the Particle Image, Black
  Hole, and Glow Horizon background plugins.

## v0.1.110

- `CodeCodex-0.1.110-x64-setup.exe`: recommended installer.
- `CodeCodex-0.1.110-x64.msi`: MSI installer.
- `CodeCodex-0.1.110-x64.zip`: portable package, including
  `Install-CodeCodex.exe` and `Uninstall-CodeCodex.exe`.
- Sets the Glow Horizon Background default profile to the selected Bottom
  direction and the latest wheel, release, return, and opening-frame values.

## v0.1.109

- `CodeCodex-0.1.109-x64-setup.exe`: recommended installer.
- `CodeCodex-0.1.109-x64.msi`: MSI installer.
- `CodeCodex-0.1.109-x64.zip`: portable package, including
  `Install-CodeCodex.exe` and `Uninstall-CodeCodex.exe`.
- Reduces Particle Image GPU work by precomputing draw-invariant cursor and
  damping values and replacing fixed powers with equivalent multiplication.
- Coalesces Glow Horizon wheel rendering into one visual update per animation
  frame while retaining every input physics update.
- Hoists Black Hole wind and disc invariants out of the ray loop and uploads
  unchanged scene uniforms only when settings or shader programs change.

## v0.1.108

- `CodeCodex-0.1.108-x64-setup.exe`: recommended installer.
- `CodeCodex-0.1.108-x64.msi`: MSI installer.
- `CodeCodex-0.1.108-x64.zip`: portable package, including
  `Install-CodeCodex.exe` and `Uninstall-CodeCodex.exe`.
- Improves Glow Horizon animation smoothness by eliminating per-frame
  specification allocations and redundant CSS style writes without changing
  the animation geometry, viewing angle, or user-facing parameters.

## v0.1.107

- `CodeCodex-0.1.107-x64-setup.exe`: recommended installer.
- `CodeCodex-0.1.107-x64.msi`: MSI installer.
- `CodeCodex-0.1.107-x64.zip`: portable package, including
  `Install-CodeCodex.exe` and `Uninstall-CodeCodex.exe`.
- Updates Glow Horizon Background defaults to match the latest design parameter
  profile, including wheel input, release, return, and entrance animation values.

## v0.1.106

- `CodeCodex-0.1.106-x64-setup.exe`: recommended installer.
- `CodeCodex-0.1.106-x64.msi`: MSI installer.
- `CodeCodex-0.1.106-x64.zip`: portable package, including
  `Install-CodeCodex.exe` and `Uninstall-CodeCodex.exe`.
- Fixes the launch guard so Electron renderer/GPU/utility children left during
  Codex shutdown do not falsely report that Codex is still running.
- Ignores only the isolated `CodeCodexOfficialProbe-*` diagnostic profile;
  genuine Codex browser processes remain protected by the guard.

## v0.1.105

- `CodeCodex-0.1.105-x64-setup.exe`: recommended installer.
- `CodeCodex-0.1.105-x64.msi`: MSI installer.
- `CodeCodex-0.1.105-x64.zip`: portable package, including
  `Install-CodeCodex.exe` and `Uninstall-CodeCodex.exe`.
- Fixes startup on the current stable Codex layout by recognizing the wrapped
  main surface and mounting the file tree only in the verified app shell.
- Starts the helper App Server after Codex's renderer is ready, avoiding the
  shared SQLite startup-lock race that could close Codex before the file tree
  appeared.

Runtime requirement: Windows 10 version 2004 (build 19041) or newer, x64,
with the official stable Codex/ChatGPT Desktop app installed.

## v0.1.104

- `CodeCodex-0.1.104-x64-setup.exe`: recommended installer.
- `CodeCodex-0.1.104-x64.msi`: MSI installer.
- `CodeCodex-0.1.104-x64.zip`: portable package, including
  `Install-CodeCodex.exe` and `Uninstall-CodeCodex.exe`.
- Updates the README plugin documentation with the Black Hole Background
  screenshot and documents its fixed internal renderer quality settings.

## v0.1.103

- `CodeCodex-0.1.103-x64-setup.exe`: recommended installer.
- `CodeCodex-0.1.103-x64.msi`: MSI installer.
- `CodeCodex-0.1.103-x64.zip`: portable package, including
  `Install-CodeCodex.exe` and `Uninstall-CodeCodex.exe`.
- Adds a conservative screen-region early exit to the Black Hole scene shader,
  skipping ray integration outside the expanded disc and strong-lensing area
  while preserving the full-screen star path.

## v0.1.102

- `CodeCodex-0.1.102-x64-setup.exe`: recommended installer.
- `CodeCodex-0.1.102-x64.msi`: MSI installer.
- `CodeCodex-0.1.102-x64.zip`: portable package, including
  `Install-CodeCodex.exe` and `Uninstall-CodeCodex.exe`.
- Fixes Black Hole renderer quality internally at 200 ray steps, 40% render
  scale, DPR 1.0, and continuous animation, while removing those renderer
  controls from the user-facing settings panel.

## v0.1.101

- `CodeCodex-0.1.101-x64-setup.exe`: recommended installer.
- `CodeCodex-0.1.101-x64.msi`: MSI installer.
- `CodeCodex-0.1.101-x64.zip`: portable package, including
  `Install-CodeCodex.exe` and `Uninstall-CodeCodex.exe`.
- Keeps both background settings panels interactive when they overlap the
  Codex draggable title-bar region, including the language switch.

## v0.1.100

- `CodeCodex-0.1.100-x64-setup.exe`: recommended installer.
- `CodeCodex-0.1.100-x64.msi`: MSI installer.
- `CodeCodex-0.1.100-x64.zip`: portable package, including
  `Install-CodeCodex.exe` and `Uninstall-CodeCodex.exe`.
- Keeps both background plugin names in English and adds one shared,
  persisted Chinese/English language slider to their parameter panels.

## v0.1.99

- `CodeCodex-0.1.99-x64-setup.exe`: recommended installer.
- `CodeCodex-0.1.99-x64.msi`: MSI installer.
- `CodeCodex-0.1.99-x64.zip`: portable package, including
  `Install-CodeCodex.exe` and `Uninstall-CodeCodex.exe`.
- Adds simultaneous Chinese/English labels and hints to both appearance
  background plugin settings panels.

## v0.1.98

- `CodeCodex-0.1.98-x64-setup.exe`: recommended installer.
- `CodeCodex-0.1.98-x64.msi`: MSI installer.
- `CodeCodex-0.1.98-x64.zip`: portable package, including
  `Install-CodeCodex.exe` and `Uninstall-CodeCodex.exe`.
- Adds the Black Hole Background appearance plugin to Preview Market.

## v0.1.97

- `CodeCodex-0.1.97-x64-setup.exe`: recommended installer.
- `CodeCodex-0.1.97-x64.msi`: MSI installer.
- `CodeCodex-0.1.97-x64.zip`: portable package, including
  `Install-CodeCodex.exe` and `Uninstall-CodeCodex.exe`.
- Keeps the native Codex Settings main surface transparent while the Particle
  Image Background is active, leaves settings cards readable, and does not
  change conversation surfaces.

## v0.1.96

- `CodeCodex-0.1.96-x64-setup.exe`: recommended installer.
- `CodeCodex-0.1.96-x64.msi`: MSI installer.
- `CodeCodex-0.1.96-x64.zip`: portable package, including
  `Install-CodeCodex.exe` and `Uninstall-CodeCodex.exe`.
- Caches stable particle WebGL state and uniforms so unchanged values are not
  resent every frame, while pointer motion and image morphing remain live.

## v0.1.95

- `CodeCodex-0.1.95-x64-setup.exe`: recommended installer.
- `CodeCodex-0.1.95-x64.msi`: MSI installer.
- `CodeCodex-0.1.95-x64.zip`: portable package, including
  `Install-CodeCodex.exe` and `Uninstall-CodeCodex.exe`.
- Finalizes the GitHub version checker by clearing interrupted progress notices
  and enforcing the same three-part release-version contract in native and UI
  validation.

## v0.1.94

- `CodeCodex-0.1.94-x64-setup.exe`: recommended installer.
- `CodeCodex-0.1.94-x64.msi`: MSI installer.
- `CodeCodex-0.1.94-x64.zip`: portable package, including
  `Install-CodeCodex.exe` and `Uninstall-CodeCodex.exe`.
- Adds editable Morph curve keyframes and intermediate nodes to Particle Image
  Background image transitions.

## v0.1.93

- `CodeCodex-0.1.93-x64-setup.exe`: recommended installer.
- `CodeCodex-0.1.93-x64.msi`: MSI installer.
- `CodeCodex-0.1.93-x64.zip`: portable package, including
  `Install-CodeCodex.exe` and `Uninstall-CodeCodex.exe`.

## v0.1.92

- `CodeCodex-0.1.92-x64-setup.exe`: recommended installer.
- `CodeCodex-0.1.92-x64.msi`: MSI installer.
- `CodeCodex-0.1.92-x64.zip`: portable package, including
  `Install-CodeCodex.exe` and `Uninstall-CodeCodex.exe`.
- Makes the file-tree version number an update checker backed by GitHub's
  latest published stable release, with current, available, ahead, and error
  states. Download and installation choices remain deferred.

## v0.1.91

- `CodeCodex-0.1.91-x64-setup.exe`: recommended installer.
- `CodeCodex-0.1.91-x64.msi`: MSI installer.
- `CodeCodex-0.1.91-x64.zip`: portable package, including
  `Install-CodeCodex.exe` and `Uninstall-CodeCodex.exe`.
- Double-click any displayed Particle Image Background value to enter it
  directly, with Enter/blur commit, Escape cancel, and percentage-aware photo
  zoom input.

## v0.1.90

- `CodeCodex-0.1.90-x64-setup.exe`: recommended installer.
- `CodeCodex-0.1.90-x64.msi`: MSI installer.
- `CodeCodex-0.1.90-x64.zip`: portable package, including
  `Install-CodeCodex.exe` and `Uninstall-CodeCodex.exe`.
- Adds independent position X, position Y, and zoom framing controls for every
  Particle Image Background photo, with persistent per-photo settings.
- Restores automatic image rotation if an Adjust operation cannot load and
  removes the installer's dependency on the `Get-FileHash` cmdlet.

## v0.1.89

- `CodeCodex-0.1.89-x64-setup.exe`: recommended installer.
- `CodeCodex-0.1.89-x64.msi`: MSI installer.
- `CodeCodex-0.1.89-x64.zip`: portable package, including
  `Install-CodeCodex.exe` and `Uninstall-CodeCodex.exe`.
- Adds independent position X, position Y, and zoom framing controls for every
  Particle Image Background photo, with live matched source/particle movement
  and persistent per-photo settings.

## v0.1.88

- `CodeCodex-0.1.88-x64-setup.exe`: recommended installer.
- `CodeCodex-0.1.88-x64.msi`: MSI installer.
- `CodeCodex-0.1.88-x64.zip`: portable package, including
  `Install-CodeCodex.exe` and `Uninstall-CodeCodex.exe`.
- Synchronizes source-image blending with the particle spring, preserves motion
  during interrupted morphs, and starts each image's dwell after morph settle.

## v0.1.87

- `CodeCodex-0.1.87-x64-setup.exe`: recommended installer.
- `CodeCodex-0.1.87-x64.msi`: MSI installer.
- `CodeCodex-0.1.87-x64.zip`: portable package, including
  `Install-CodeCodex.exe` and `Uninstall-CodeCodex.exe`.
- Supports the callable RPC namespaces used by current stable Codex so Particle
  Image Background can switch to Dark mode automatically.

## v0.1.86

- `CodeCodex-0.1.86-x64-setup.exe`: recommended installer.
- `CodeCodex-0.1.86-x64.msi`: MSI installer.
- `CodeCodex-0.1.86-x64.zip`: portable package, including
  `Install-CodeCodex.exe` and `Uninstall-CodeCodex.exe`.
- Keeps authoritative Codex Appearance monitoring active across particle image
  changes and automatic image rotation.

## v0.1.85

- `CodeCodex-0.1.85-x64-setup.exe`: recommended installer.
- `CodeCodex-0.1.85-x64.msi`: MSI installer.
- `CodeCodex-0.1.85-x64.zip`: portable package, including
  `Install-CodeCodex.exe` and `Uninstall-CodeCodex.exe`.
- Switches Particle Image Background to Codex Dark mode automatically through
  the stable desktop settings bridge and restores the previous Light or System
  preference when the plugin is disabled.

## v0.1.81

- `CodeCodex-0.1.81-x64-setup.exe`: recommended installer.
- `CodeCodex-0.1.81-x64.msi`: MSI installer.
- `CodeCodex-0.1.81-x64.zip`: portable package, including
  `Install-CodeCodex.exe` and `Uninstall-CodeCodex.exe`.
- Reworks Particle Image Background pointer flow as inertial gas advection
  instead of home-anchored elastic displacement.
- Keeps disturbed particles moving under damping until lifetime expiry while
  preserving image morphing, regeneration, and continuous ambient flow.

## v0.1.80

- `CodeCodex-0.1.80-x64-setup.exe`: recommended installer.
- `CodeCodex-0.1.80-x64.msi`: MSI installer.
- `CodeCodex-0.1.80-x64.zip`: portable package, including
  `Install-CodeCodex.exe` and `Uninstall-CodeCodex.exe`.
- Raises Particle Image Background's Cursor strength maximum from `40` to
  `400`, with proportional shader force and displacement headroom.

## v0.1.79

- `CodeCodex-0.1.79-x64-setup.exe`: recommended installer.
- `CodeCodex-0.1.79-x64.msi`: MSI installer.
- `CodeCodex-0.1.79-x64.zip`: portable package, including
  `Install-CodeCodex.exe` and `Uninstall-CodeCodex.exe`.
- Switches Particle Image Background through Codex's real
  `Settings > Appearance > Base theme` action instead of simulating Dark mode.
- Restores the previous Codex theme when the particle plugin is disabled and
  keeps an explicit user theme change disabled across the next launch.

## v0.1.78

- `CodeCodex-0.1.78-x64-setup.exe`: recommended installer.
- `CodeCodex-0.1.78-x64.msi`: MSI installer.
- `CodeCodex-0.1.78-x64.zip`: portable package, including
  `Install-CodeCodex.exe` and `Uninstall-CodeCodex.exe`.
- Makes the complete Particle Image Background control set available to users,
  including particles, flow, source, pointer, and render settings.
- Opens particle controls in a dedicated secondary panel to the right of the
  plugin card, keeping the Preview Market and file tree compact and visible.

## v0.1.77

- `CodeCodex-0.1.77-x64-setup.exe`: recommended installer.
- `CodeCodex-0.1.77-x64.msi`: MSI installer.
- `CodeCodex-0.1.77-x64.zip`: portable package, including
  `Install-CodeCodex.exe` and `Uninstall-CodeCodex.exe`.
- Extends Particle Image Background across the native Codex sidebar, the
  Code-Codex file tree, the application chrome, and the conversation surface.
- Keeps controls, menus, dialogs, and text on stronger dark surfaces while the
  large structural areas remain translucent and the file tree stays mounted.

## v0.1.76

- `CodeCodex-0.1.76-x64-setup.exe`: recommended installer.
- `CodeCodex-0.1.76-x64.msi`: MSI installer.
- `CodeCodex-0.1.76-x64.zip`: portable package, including
  `Install-CodeCodex.exe` and `Uninstall-CodeCodex.exe`.
- Applies Codex's dark presentation while Particle Image Background is active,
  leaving the particle map visible beneath a readable conversation surface.
- Keeps the file tree on an opaque dark surface and removes the particle layer
  when the explorer is explicitly dismissed, preventing an orphaned background.

## v0.1.75

- `CodeCodex-0.1.75-x64-setup.exe`: recommended installer.
- `CodeCodex-0.1.75-x64.msi`: MSI installer.
- `CodeCodex-0.1.75-x64.zip`: portable package, including
  `Install-CodeCodex.exe` and `Uninstall-CodeCodex.exe`.
- Restores readable, theme-aware Codex surfaces while Particle Image Background
  is enabled and keeps the Code-Codex file tree visibly above the particle layer.
- Prevents Particle Image Background and Transparent Background presentation
  states from overlapping during startup or extension switching.

## v0.1.74

- `CodeCodex-0.1.74-x64-setup.exe`: recommended installer.
- `CodeCodex-0.1.74-x64.msi`: MSI installer.
- `CodeCodex-0.1.74-x64.zip`: portable package, including
  `Install-CodeCodex.exe` and `Uninstall-CodeCodex.exe`.
- Finalizes the Particle Image Background plugin package, including the Source
  library guidance shown when no image has been added yet.

## v0.1.73

- `CodeCodex-0.1.73-x64-setup.exe`: recommended installer.
- `CodeCodex-0.1.73-x64.msi`: MSI installer.
- `CodeCodex-0.1.73-x64.zip`: portable package, including
  `Install-CodeCodex.exe` and `Uninstall-CodeCodex.exe`.
- Adds Particle Image Background to the built-in plugin market with a persistent
  grayscale image library, automatic image switching, and smooth particle morphs.
- Exposes only Particle count and Source controls; advanced Flow, Pointer, and
  Render parameters use the fixed effect defaults.

## v0.1.72

- `CodeCodex-0.1.72-x64-setup.exe`: recommended installer.
- `CodeCodex-0.1.72-x64.msi`: MSI installer.
- `CodeCodex-0.1.72-x64.zip`: portable package, including
  `Install-CodeCodex.exe` and `Uninstall-CodeCodex.exe`.
- Restores project resolution, the file tree, and file preview in newly created
  Codex conversations whose sidebar still uses a temporary local task ID.
- Keeps canonical task-ID validation strict and rejects malformed or
  conflicting conversation signals.

## v0.1.71

- `CodeCodex-0.1.71-x64-setup.exe`: recommended installer.
- `CodeCodex-0.1.71-x64.msi`: MSI installer.
- `CodeCodex-0.1.71-x64.zip`: portable package, including
  `Install-CodeCodex.exe` and `Uninstall-CodeCodex.exe`.
- Displays the Code-Codex version when no local project is selected.
- Prompts for Microsoft PowerPoint only when legacy `.ppt` preview detects
  that PowerPoint is unavailable and uses the built-in renderer.

## v0.1.70

- `CodeCodex-0.1.70-x64-setup.exe`: recommended installer.
- `CodeCodex-0.1.70-x64.msi`: MSI installer.
- `CodeCodex-0.1.70-x64.zip`: portable package, including
  `Install-CodeCodex.exe` and `Uninstall-CodeCodex.exe`.
- Displays the active Code-Codex version in the file-tree footer.
- Supports native legacy `.ppt` rendering through both 64-bit and 32-bit
  PowerPoint automation registrations on x64 Windows.
- Recovers from an unavailable running PowerPoint automation object without
  modifying or closing the user's existing PowerPoint session.

## v0.1.69

- `CodeCodex-0.1.69-x64-setup.exe`: recommended installer.
- `CodeCodex-0.1.69-x64.msi`: MSI installer.
- `CodeCodex-0.1.69-x64.zip`: portable package, including
  `Install-CodeCodex.exe` and `Uninstall-CodeCodex.exe`.
- Uses installed Microsoft PowerPoint for full-fidelity legacy `.ppt` preview
  even when a PowerPoint session is already open.
- Preserves borrowed PowerPoint sessions and falls back to the embedded
  renderer when PowerPoint automation is unavailable or cannot render safely.

## v0.1.68

- `CodeCodex-0.1.68-x64-setup.exe`: recommended installer.
- `CodeCodex-0.1.68-x64.msi`: MSI installer.
- `CodeCodex-0.1.68-x64.zip`: portable package, including
  `Install-CodeCodex.exe` and `Uninstall-CodeCodex.exe`.
- Keeps Direct Composition enabled for the Windows 10 transparent window so
  VMware can use Chromium's safe hardware alpha surface.
- Prevents Codex's backdrop updates from repainting the Windows 10 window
  opaque while preserving the existing click-through safety checks.

## v0.1.67

- `CodeCodex-0.1.67-x64-setup.exe`: recommended installer.
- `CodeCodex-0.1.67-x64.msi`: MSI installer.
- `CodeCodex-0.1.67-x64.zip`: portable package, including
  `Install-CodeCodex.exe` and `Uninstall-CodeCodex.exe`.
- Fixes the Windows 10 startup error by installing the transparent
  `BrowserWindow` hook at Electron's first valid paused call frame.
- Uses the Windows 10 per-pixel alpha path without enabling unsupported
  Windows 11 system-backdrop materials.

## v0.1.66

- `CodeCodex-0.1.66-x64-setup.exe`: recommended installer.
- `CodeCodex-0.1.66-x64.msi`: MSI installer.
- `CodeCodex-0.1.66-x64.zip`: portable package, including
  `Install-CodeCodex.exe` and `Uninstall-CodeCodex.exe`.
- Initializes the official Codex Electron window with a transparent backing
  surface on Windows 10 before the window is shown.
- Keeps the existing Windows 11 startup and compositor paths unchanged.

## v0.1.65

- `CodeCodex-0.1.65-x64-setup.exe`: recommended installer.
- `CodeCodex-0.1.65-x64.msi`: MSI installer.
- `CodeCodex-0.1.65-x64.zip`: portable package, including
  `Install-CodeCodex.exe` and `Uninstall-CodeCodex.exe`.
- Adds the legacy full-client DWM glass path used by the later Windows 10 transparency fix.
- Keeps the existing Windows 11 compositor path unchanged.

## v0.1.64

- `CodeCodex-0.1.64-x64-setup.exe`: recommended installer.
- `CodeCodex-0.1.64-x64.msi`: MSI installer.
- `CodeCodex-0.1.64-x64.zip`: portable package, including
  `Install-CodeCodex.exe` and `Uninstall-CodeCodex.exe`.
- Adds copy-style drag and drop from Windows File Explorer into the workspace root or any file-tree folder, including nested folders, empty entries, Unicode names, and hidden files.
- Preflights destination conflicts, shows copy progress, refreshes the destination, and preserves the existing in-tree move behavior.
- Streams bounded file data through native staged imports with no overwrite, atomic final placement, context/lifecycle cleanup, and no renderer-supplied absolute source paths.

## v0.1.63

- `CodeCodex-0.1.63-x64-setup.exe`: recommended installer.
- `CodeCodex-0.1.63-x64.msi`: MSI installer.
- `CodeCodex-0.1.63-x64.zip`: portable package, including
  `Install-CodeCodex.exe` and `Uninstall-CodeCodex.exe`.
- Fixes `.gltf` and `.glb` rendering under Codex's content security policy by loading model buffers from bounded memory and textures through the permitted image path.
- Keeps model resources local, restores loader state after every preview, and supports external, embedded data-URI, and GLB-embedded resources without weakening Codex security settings.

## v0.1.62

- `CodeCodex-0.1.62-x64-setup.exe`: recommended installer.
- `CodeCodex-0.1.62-x64.msi`: MSI installer.
- `CodeCodex-0.1.62-x64.zip`: portable package, including
  `Install-CodeCodex.exe` and `Uninstall-CodeCodex.exe`.
- Adds an independently enabled 3D Model Preview extension for `.gltf` and `.glb`.
- Renders glTF 2.0 models locally with orbit, pan, zoom, fit/reset, a reference grid, and animation playback.
- Loads only bounded, model-declared workspace buffers and textures; network resources and unsupported Draco, KTX2/Basis, or Meshopt compression fail closed with clear messages.

## v0.1.61

- `CodeCodex-0.1.61-x64-setup.exe`: recommended installer.
- `CodeCodex-0.1.61-x64.msi`: MSI installer.
- `CodeCodex-0.1.61-x64.zip`: portable package, including
  `Install-CodeCodex.exe` and `Uninstall-CodeCodex.exe`.
- Keeps setup and uninstall progress and result windows centered.
- Reasserts final success and error dialog activation after display so they stay above other applications without moving toward the screen edge.

## v0.1.60

- `CodeCodex-0.1.60-x64-setup.exe`: recommended installer.
- `CodeCodex-0.1.60-x64.msi`: MSI installer.
- `CodeCodex-0.1.60-x64.zip`: portable package, including
  `Install-CodeCodex.exe` and `Uninstall-CodeCodex.exe`.
- Restores centered placement for setup and uninstall progress and result windows.
- Uses a topmost modal owner so final success and error dialogs open above other applications and receive foreground focus.

## v0.1.59

- `CodeCodex-0.1.59-x64-setup.exe`: recommended installer.
- `CodeCodex-0.1.59-x64.msi`: MSI installer.
- `CodeCodex-0.1.59-x64.zip`: portable package, including
  `Install-CodeCodex.exe` and `Uninstall-CodeCodex.exe`.
- Places setup and uninstall progress, completion, and error windows at the top center of the active monitor.
- Keeps those windows topmost and brings them to the foreground on Windows 10 and Windows 11.

## v0.1.58

- `CodeCodex-0.1.58-x64-setup.exe`: recommended installer.
- `CodeCodex-0.1.58-x64.msi`: MSI installer.
- `CodeCodex-0.1.58-x64.zip`: portable package, including
  `Install-CodeCodex.exe` and `Uninstall-CodeCodex.exe`.
- Keeps setup and uninstall progress, completion, and error windows above ordinary application windows.
- Shows uninstall progress through the final MSI or installed-file removal stage instead of ending after preparation.

## v0.1.57

- `CodeCodex-0.1.57-x64-setup.exe`: recommended installer.
- `CodeCodex-0.1.57-x64.msi`: MSI installer.
- `CodeCodex-0.1.57-x64.zip`: portable package, including
  `Install-CodeCodex.exe` and `Uninstall-CodeCodex.exe`.
- Keeps Codex's native conversation title hidden beneath the preview tab strip while preserving its right-side window actions.
- Restores Electron's full DWM client frame when Transparent Background is disabled, preventing black shell regions.

## v0.1.56

- `CodeCodex-0.1.56-x64-setup.exe`: recommended installer.
- `CodeCodex-0.1.56-x64.msi`: MSI installer.
- `CodeCodex-0.1.56-x64.zip`: portable package, including
  `Install-CodeCodex.exe` and `Uninstall-CodeCodex.exe`.
- Hides the conversation surface while a file preview is active, including when Transparent Background is enabled.
- Restores the conversation surface and its original state when returning to Conversation or closing the final preview tab.

## v0.1.55

- `CodeCodex-0.1.55-x64-setup.exe`: recommended installer.
- `CodeCodex-0.1.55-x64.msi`: MSI installer.
- `CodeCodex-0.1.55-x64.zip`: portable package, including
  `Install-CodeCodex.exe` and `Uninstall-CodeCodex.exe`.
- Keeps Transparent Background visible in restored Codex windows by removing Electron's extended DWM client frame on every health pass.
- Preserves the non-layered, input-active Codex window while allowing Chromium's transparent pixels to reach the desktop compositor.
- Retains the restored-window fix across resize, maximize, and restore transitions.

## v0.1.54

- `CodeCodex-0.1.54-x64-setup.exe`: recommended installer.
- `CodeCodex-0.1.54-x64.msi`: MSI installer.
- `CodeCodex-0.1.54-x64.zip`: portable package, including
  `Install-CodeCodex.exe` and `Uninstall-CodeCodex.exe`.
- Keeps Transparent Background active in both restored and maximized Codex windows by disabling the Windows 11 rounded-corner compositor path while the plugin is enabled.
- Restores the exact original DWM corner preference together with the original accent and backdrop when transparency is disabled or Code-Codex exits.
- Keeps the complete Codex window input-active; transparent pixels do not pass input through to applications behind Codex.

## v0.1.53

- `CodeCodex-0.1.53-x64-setup.exe`: recommended installer.
- `CodeCodex-0.1.53-x64.msi`: MSI installer.
- `CodeCodex-0.1.53-x64.zip`: portable package, including
  `Install-CodeCodex.exe` and `Uninstall-CodeCodex.exe`.
- Uses a transparent Windows compositor surface instead of layered color-key pixels, revealing the desktop and applications behind Codex without click-through input.
- Keeps the verified main Codex window non-layered and input-active across its complete rectangular area.
- Serializes transparency revalidation with enable/disable actions and clears the remaining Codex background fade layers.
- Restores the original DWM backdrop and disables the temporary compositor accent when transparency is turned off or Code-Codex exits.

## v0.1.52

- `CodeCodex-0.1.52-x64-setup.exe`: recommended installer.
- `CodeCodex-0.1.52-x64.msi`: MSI installer.
- `CodeCodex-0.1.52-x64.zip`: portable package, including
  `Install-CodeCodex.exe` and `Uninstall-CodeCodex.exe`.
- Starts Codex without DirectComposition so Windows color-key transparency uses a redirected surface instead of displaying the key color as black.
- Selects only the verified main Codex app window and rejects the avatar overlay or an incompatible no-redirection surface.
- Verifies the native color key before applying transparent CSS and fails without changing the Codex background when verification does not pass.

## v0.1.51

- `CodeCodex-0.1.51-x64-setup.exe`: recommended installer.
- `CodeCodex-0.1.51-x64.msi`: MSI installer.
- `CodeCodex-0.1.51-x64.zip`: portable package, including
  `Install-CodeCodex.exe` and `Uninstall-CodeCodex.exe`.
- Replaces whole-window fading with binary color-key transparency, leaving non-background text, icons, controls, and preview content fully opaque.
- Restores the exact original Codex layered-window state when Transparent Background is disabled or Code-Codex exits.

## v0.1.50

- `CodeCodex-0.1.50-x64-setup.exe`: recommended installer.
- `CodeCodex-0.1.50-x64.msi`: MSI installer.
- `CodeCodex-0.1.50-x64.zip`: portable package, including
  `Install-CodeCodex.exe` and `Uninstall-CodeCodex.exe`.
- Removes the fixed Codex package-version allowlist so future versions can proceed through runtime compatibility checks.
- Retains verified process ownership, CDP protocol validation, and live DOM qualification before Code-Codex is injected.

## v0.1.49

- `CodeCodex-0.1.49-x64-setup.exe`: recommended installer.
- `CodeCodex-0.1.49-x64.msi`: MSI installer.
- `CodeCodex-0.1.49-x64.zip`: portable package, including
  `Install-CodeCodex.exe` and `Uninstall-CodeCodex.exe`.
- Adds an optional Transparent Background appearance plugin to Preview Market.
- Applies reversible whole-window translucency only to the verified Codex process so applications and the desktop behind Codex remain visible.
- Restores the original opaque appearance when the plugin is disabled or the Code-Codex bridge exits.

## v0.1.48

- `CodeCodex-0.1.48-x64-setup.exe`: recommended installer.
- `CodeCodex-0.1.48-x64.msi`: MSI installer.
- `CodeCodex-0.1.48-x64.zip`: portable package, including
  `Install-CodeCodex.exe` and `Uninstall-CodeCodex.exe`.
- Adds one independently enabled Diagram Preview extension for `.drawio` and `.plantuml` files.
- Renders Draw.io shapes and common PlantUML activity syntax locally as bounded SVG without uploading source code.
- Keeps versioned raw edit mode available and rejects external resources, unsafe XML, and truncated diagrams.

## v0.1.47

- `CodeCodex-0.1.47-x64-setup.exe`: recommended installer.
- `CodeCodex-0.1.47-x64.msi`: MSI installer.
- `CodeCodex-0.1.47-x64.zip`: portable package, including
  `Install-CodeCodex.exe` and `Uninstall-CodeCodex.exe`.
- Adds an independently enabled CSV Preview extension for `.csv` files.
- Renders bounded comma-delimited data in an accessible table with sticky row and column headers.
- Preserves quoted commas, embedded line breaks, leading zeros, and formula-like values as literal text; raw edit mode remains available.

## v0.1.46

- `CodeCodex-0.1.46-x64-setup.exe`: recommended installer.
- `CodeCodex-0.1.46-x64.msi`: MSI installer.
- `CodeCodex-0.1.46-x64.zip`: portable package, including
  `Install-CodeCodex.exe` and `Uninstall-CodeCodex.exe`.
- Adds an independently enabled, local Jupyter Notebook Preview extension for `.ipynb` files.
- Renders Markdown and syntax-highlighted code cells with saved outputs without executing notebook code.
- Loads notebooks through bounded, versioned native chunks and applies read-only rendering limits.

## v0.1.45

- `CodeCodex-0.1.45-x64-setup.exe`: recommended installer.
- `CodeCodex-0.1.45-x64.msi`: MSI installer.
- `CodeCodex-0.1.45-x64.zip`: portable package, including
  `Install-CodeCodex.exe` and `Uninstall-CodeCodex.exe`.
- Splits automatically overflowing DOCX paragraphs and tables into page-sized preview cards when the source file has no cached Word page-break markers.
- Preserves same-size next-page section transitions while retaining dotted leaders and right-aligned cached page numbers.

## v0.1.44

- `CodeCodex-0.1.44-x64-setup.exe`: recommended installer.
- `CodeCodex-0.1.44-x64.msi`: MSI installer.
- `CodeCodex-0.1.44-x64.zip`: portable package, including
  `Install-CodeCodex.exe` and `Uninstall-CodeCodex.exe`.
- Restores dotted leaders and right-aligned cached page numbers in DOCX contents and illustration lists.
- Honors direct page-before properties in the preview copy so sections such as illustration lists begin on a new page without modifying the source document.

## v0.1.43

- `CodeCodex-0.1.43-x64-setup.exe`: recommended installer.
- `CodeCodex-0.1.43-x64.msi`: MSI installer.
- `CodeCodex-0.1.43-x64.zip`: portable package, including
  `Install-CodeCodex.exe` and `Uninstall-CodeCodex.exe`.
- Improves legacy PPT fidelity through local, read-only Microsoft PowerPoint rendering when available, with the embedded renderer retained as a fallback.

## v0.1.42

- `CodeCodex-0.1.42-x64-setup.exe`: recommended installer.
- `CodeCodex-0.1.42-x64.msi`: MSI installer.
- `CodeCodex-0.1.42-x64.zip`: portable package, including
  `Install-CodeCodex.exe` and `Uninstall-CodeCodex.exe`.
- Improves DOCX layout fidelity and adds local, read-only legacy PPT preview support.

## v0.1.41

- `CodeCodex-0.1.41-x64-setup.exe`: recommended installer.
- `CodeCodex-0.1.41-x64.msi`: MSI installer.
- `CodeCodex-0.1.41-x64.zip`: portable package, including
  `Install-CodeCodex.exe` and `Uninstall-CodeCodex.exe`.
- Adds an independently enabled, local Office Preview extension for DOCX, XLSX, and PPTX files.

## v0.1.40

- `CodeCodex-0.1.40-x64-setup.exe`: recommended installer.
- `CodeCodex-0.1.40-x64.msi`: MSI installer.
- `CodeCodex-0.1.40-x64.zip`: portable package, including
  `Install-CodeCodex.exe` and `Uninstall-CodeCodex.exe`.
- Adds independently enabled PDF Preview and Audio Preview extensions to Preview Market.

## v0.1.39

- `CodeCodex-0.1.39-x64-setup.exe`: recommended installer.
- `CodeCodex-0.1.39-x64.msi`: MSI installer.
- `CodeCodex-0.1.39-x64.zip`: portable package, including
  `Install-CodeCodex.exe` and `Uninstall-CodeCodex.exe`.
- Removes plugin description text from Preview Market cards while preserving format tags.

## v0.1.38

- `CodeCodex-0.1.38-x64-setup.exe`: recommended installer.
- `CodeCodex-0.1.38-x64.msi`: MSI installer.
- `CodeCodex-0.1.38-x64.zip`: portable package, including
  `Install-CodeCodex.exe` and `Uninstall-CodeCodex.exe`.
- Adds independently enabled Image Preview and Video Preview extensions to Preview Market.
- Loads supported media through bounded, versioned native chunks and releases temporary Blob URLs when previews close.
- Supports PNG, JPEG, GIF, WebP, BMP, ICO, AVIF, MP4, WebM, OGV, MOV, and M4V previews.

## v0.1.37

- `CodeCodex-0.1.37-x64-setup.exe`: recommended installer.
- `CodeCodex-0.1.37-x64.msi`: MSI installer.
- `CodeCodex-0.1.37-x64.zip`: portable package, including
  `Install-CodeCodex.exe` and `Uninstall-CodeCodex.exe`.
- Adds rendered, directly editable Markdown in Edit mode when Markdown Preview is enabled.
- Saves visual edits back as Markdown source and preserves the visible scroll position.
- Preserves YAML front matter, HTML comments, table pipes/line breaks, and editor focus during saves.

## v0.1.36

- `CodeCodex-0.1.36-x64-setup.exe`: recommended installer.
- `CodeCodex-0.1.36-x64.msi`: MSI installer.
- `CodeCodex-0.1.36-x64.zip`: portable package, including
  `Install-CodeCodex.exe` and `Uninstall-CodeCodex.exe`.
- Preserves the visible code position and caret when entering edit mode.
- Keeps Markdown rendered in read-only mode and raw in edit mode.

## v0.1.35

- `CodeCodex-0.1.35-x64-setup.exe`: recommended installer.
- `CodeCodex-0.1.35-x64.msi`: MSI installer.
- `CodeCodex-0.1.35-x64.zip`: portable package, including
  `Install-CodeCodex.exe` and `Uninstall-CodeCodex.exe`.
- Simplifies the Markdown preview card text and file-type tags.

## v0.1.34

- `CodeCodex-0.1.34-x64-setup.exe`: recommended installer.
- `CodeCodex-0.1.34-x64.msi`: MSI installer.
- `CodeCodex-0.1.34-x64.zip`: portable package, including
  `Install-CodeCodex.exe` and `Uninstall-CodeCodex.exe`.
- Adds the attached Preview Market popover and bundled Markdown previewer.

## v0.1.33

- `CodeCodex-0.1.33-x64-setup.exe`: recommended installer.
- `CodeCodex-0.1.33-x64.msi`: MSI installer.
- `CodeCodex-0.1.33-x64.zip`: portable package, including
  `Install-CodeCodex.exe` and `Uninstall-CodeCodex.exe`.
- `Uninstall-CodeCodex.exe`: standalone uninstaller for an existing install.
- `SHA256SUMS.txt`: SHA-256 checksums for the downloadable files.

If official Codex/ChatGPT Desktop is installed, the installer checks desktop
`Codex` first, then desktop `ChatGPT`. It creates a managed `Code-Codex`
desktop shortcut only when neither official shortcut exists, and removes that
managed shortcut on uninstall.

The same files can be regenerated from source with:

```powershell
./scripts/package.ps1 -Version 0.1.106
```
