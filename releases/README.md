# Releases

This folder contains ready-made downloadable packages.

## v0.3.0 — 版本号更新

- 将当前版本号更新为 v0.3.0；包含此前文件树展开栏与对话区域半透明背景的接缝修复。

## v0.2.62 — 补齐展开栏与对话区域的接缝

- 粒子背景与 Glow Horizon 下，收起文件树时展开栏右侧不再露出细小的竖向缝隙。

## v0.2.61 — 展开按钮与对话区域透明度一致

- 文件树收起后，粒子类背景与 Glow Horizon 下的展开按钮采用与对话区域相同的半透明背景，既能透出效果，也不会显得完全透明。

## v0.2.60 — 粒子背景下的透明展开按钮

- 文件树收起后，粒子类背景与 Glow Horizon 下的展开按钮保持透明，不再遮挡背景画面。

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
