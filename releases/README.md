# Code-Codex v0.5.89

本次软件更新覆盖上一公开软件版本 **v0.5.40 → v0.5.89** 的全部保留改动；期间本地保存和测试版本合并到本次发布，不单独视作公开更新。[完整源码比较](https://github.com/Rice-dog/code-codex/compare/v0.5.40...v0.5.89)。

## 简体中文

- **浅海来信**：新增本地 WebGL 海洋背景，包含交互水波、十种海洋生物模型和横向生物选择栏。支持默认居民、整体参数重置、单独清除生物、随机海洋奇遇及收集后的事件筛选；陨石事件中各生物落水后立即恢复游动。提供自动、低、中、高画质，调节细节和像素负担，继续以60 FPS为绘图目标，不以降低目标帧率替代降画质。
- **背景绘图隔离**：11种 Canvas 背景迁入各自 Worker；发光地平线使用浏览器合成动画，Custom Background 保留原始图片/视频播放。减少打开模型、权限、账号等官方菜单时的绘图阻塞。有界消息队列、实际首帧确认、暂停/恢复、取消与资源释放共用统一生命周期；GPU、驱动和输入交付仍共享，不承诺所有设备绝对互不影响。
- **开场与启动来源**：浅海分阶段淡入、标题与镜头移动，开场中鼠标仍可产生水波；修复开场前海面闪现。粒子图像避免完整源图闪现并柔和显现；黑洞整体淡入；像素雕塑采用方块落定开场且重新启用可重播。启动动画可选13种背景来源，新增浅海，并保留ASCII、Custom、本地图库等独立只读副本；覆盖释放后普通背景再继续。
- **透明度与布局**：UI Surface Opacity 扩展到变更文件卡片和图标、文件树/新对话文件图标、新对话工作区栏；一个参数联动插件市场与参数面板的底色。浅海参数采用横向紧凑布局，生物在同一行，减少遮挡与冗余描述。正常文字、控件和确认框的可读性边界保留。
- **置顶快捷入口**：置顶插件会在市场按钮与版本号之间显示原图标；跨分类直接定位并打开对应参数，不自动启用插件。窄幅使用更多菜单，取消置顶即时同步；隐藏插件不生成快捷入口。
- **同版本更新与宿主恢复**：内部构建标识区分同一应用版本的不同字节，避免热更新仍挂载旧界面。安装增加同版本核心备份、完整性复核与冲突时保守回滚；保留设置、用户素材和匹配缓存。改善登录页面/工作区及文件树恢复、版本反馈和启动覆盖的退场处理。官方接口按能力/响应合同检测，保留兼容分支；未知或缺失能力隔离具体功能，不靠单个官方版本白名单放行。
- **中文恢复窗口**：修复语言目录中弯引号被PowerShell误当成引号边界的问题，保留原始文案，补充完整原生生成脚本解析及逐字往返测试；中文诊断/恢复窗口不再因这些目录文案而解析失败。
- **资源与诊断**：市场展示27项插件（Appearance16、File Preview10、Tools1）；更新后的背景/播放器/透明度资源按精确版本、大小和SHA核验，未变媒体及插件缓存继续复用。更新脚本发布到独立资源Release；透明度脚本仅迁移分发tag，代码字节/插件版本不变。错误及过程日志保持英文，并提供更具体的阶段、关联编号、等待与未知结果信息；不记录认证令牌或对话正文。

### 安装与验证范围

推荐 `CodeCodex-0.5.89-x64-setup.exe`；另提供 MSI、ZIP、独立卸载程序、插件目录和SHA256清单。已有安装可沿原目录更新，保留设置、原素材和完整匹配的插件缓存。启动只读取已下载校验的依赖，缺包不阻塞官方启动；不会预下载所有插件。

本机已完成编译、相关功能检查、安装及实际界面热接管，确认文件树和Bridge就绪；公开附件和插件资源已核对下载大小及SHA256。验证范围仅限记录的本机环境，历史检查不代表全部平台均已重新验证。

本版仍为社区预览软件。所有GPU/官方客户端版本、长时间压力、实际Windows登录冷启动和完整MSI升级/卸载矩阵尚未全面覆盖；60 FPS是目标，非设备性能保证。

## English

This release includes all retained changes from the previous public software release, **v0.5.40 to v0.5.89**. Intermediate local checkpoints/test versions are consolidated here rather than treated as separate public updates. [Full source comparison](https://github.com/Rice-dog/code-codex/compare/v0.5.40...v0.5.89).

- **Shallow Ocean Letters:** Adds a local WebGL ocean with interactive ripples, ten marine model types and a horizontal creature dock. Default residents, global parameter reset, separate population clearing, random encounters and post-collection inclusion filters are supported. Each resident resumes swimming on its own meteor-event water landing. Auto/Low/Medium/High quality adjust detail and pixel workload while retaining a60 FPS target; quality reduction does not substitute a lower target frame rate.
- **Isolated drawing:** Eleven Canvas backgrounds render in their own Workers; Glow Horizon uses browser-composited animation, and Custom Background keeps original image/video playback. This reduces drawing stalls when official model, permission/account and other controls open. Bounded queues, actual-first-frame readiness, pause/resume, cancellation and disposal share a lifecycle. GPU, drivers and input delivery remain shared; universal zero interference is not promised.
- **Openings and startup sources:** Ocean fades in, displays its title and moves its camera in stages, with mouse ripples available during the opening and no pre-opening ocean flash. Particle Image avoids showing the full source image and reveals its particles smoothly. Black Hole fades in as a whole; Pixel Sculpt opens with settling blocks and replays on re-enable. Startup Transition offers13 background sources, now including Ocean, with independent read-only ASCII/Custom/local-gallery copies; normal backgrounds resume after the overlay releases.
- **Opacity and layout:** UI Surface Opacity now covers changed-file cards/icons, tree/new-chat file icons and the new-chat workspace strip. One setting jointly adjusts market and parameter-panel backgrounds. Ocean uses a compact horizontal panel with its creature models on one row. Ordinary content/control readability and confirmation-dialog boundaries remain.
- **Pinned shortcuts:** Pinned plugins reuse their icons between the market button and version. Shortcuts locate the correct category and open settings without enabling a plugin. Narrow layouts use an overflow menu; unpinning updates immediately, and hidden plugins produce no shortcut.
- **Same-version updates and host recovery:** Content build identities distinguish different bytes of the same application version so hot updates mount the new UI. Installation backs up same-version core payloads, verifies integrity and conservatively rolls back conflicting changes, while preserving settings/media/matching caches. Login/workspace/tree recovery, version feedback and overlay exit behavior improve. Official interfaces are qualified by bounded capability/response contracts, with compatibility branches and per-feature isolation rather than a single official-build allowlist.
- **Chinese recovery windows:** Fixes typographic single quotes in catalog data being parsed as PowerShell delimiters. Text is preserved verbatim, with native full-script parsing and literal-roundtrip coverage, preventing these entries from breaking Chinese diagnostic/recovery windows.
- **Resources and diagnostics:** The market exposes27 plugins (16 Appearance,10 File Preview,1 Tools). Exact version/size/SHA checks protect updated backgrounds/player/opacity scripts while unchanged media/plugin caches remain reusable. Updated scripts use a separate asset Release; opacity only changes its distribution tag, not its bytes or plugin version. English diagnostics distinguish stages, correlation IDs, waits and unknown outcomes without logging credentials or conversation text.

### Installation and validation scope

Prefer `CodeCodex-0.5.89-x64-setup.exe`; MSI, ZIP, standalone uninstaller, plugin catalog and SHA256 manifest are also supplied. Updates reuse the installation root and preserve settings, original media and matching complete plugin caches. Startup reads only downloaded, verified dependencies; missing optional packages do not block official startup, and installation does not pre-download every plugin.

Local compilation, relevant feature checks, installation and actual hot activation were completed, with the file tree and Bridge ready. Public attachments and plugin resources were checked against their download sizes and SHA256 values. Verification covers the recorded local environment; historical checks are not presented as a fresh all-platform run.

This remains community preview software. All GPUs/official-client builds, long stress runs, real Windows-login cold startup and full MSI upgrade/uninstall matrices have not been exhaustively exercised.60 FPS is a target, not a hardware guarantee.
