# Code-Codex v0.5.7

本次软件更新范围为上一正式 Release **v0.4.52 → v0.5.7**，包含期间全部已保留功能与最终修复。独立插件资源 Release 不计为软件更新基准。

## 简体中文

- **全局语言**：安装欢迎页按系统语言预选中文或英文；安装后可在 Code-Codex → 语言子菜单切换。普通界面、右键菜单及插件参数跟随全局设置，插件名称保留英文，技术错误与诊断日志使用英文。
- **Custom Background**：新增本地图片/视频素材库与逐素材位置、缩放、旋转、透明度和外观调节，参数区提供 Reset。卡片、素材库和设置面板遵循共用样式；与 UI Surface Opacity 共存。打开设置保留素材库及背景节点，视频预览跟随当前背景进度。
- **背景透明度**：统一树、文件预览与背景表面规则，补齐自定义背景下的文件预览、官方设置和次级面板底板。对话顶部/底部遮罩共用现有对话区透明度，不增加重复滑块；保留文档内容必要底色和文字可读性。
- **账号切换与启动**：改进登录/退出或页面重载后的 renderer/Bridge 监督、重连与恢复；细分启动、CDP、进程身份、存储、网络与安装阶段的诊断，保留原始异常及恢复证据。继续保持受限本地操作和进程资格校验。
- **安装与卸载**：中英文品牌向导、带版本号的根启动器、默认尝试热激活；普通卸载保留设置/素材/插件，Purge 清理受管数据和图标。卸载 EXE 与 worker 不再继承安装根工作目录，修复文件已清除却因根目录占用持续报错；真实剩余文件仍报错，并保留首次及末次原因。第三方仅占着已清空的目录时记录具体诊断，允许保留可重装的空目录。
- **插件下载与维护**：25 个插件采用独立版本、显式发布 tag、资源闭包与大小/SHA 校验。未改插件不随应用升级更换地址或要求重下；修正缺资源插件的分发位置，复用已有公开媒体。应用、功能控制器、公共生命周期、原生服务、预览实现、语言域和安装脚本拆分为有明确职责的模块，增加边界与回归检查。

### 升级与验证边界

EXE/ZIP 用户使用完整安装包覆盖原目录即可，保留设置、原素材和匹配缓存，无需先卸载。插件内容改变、缺失或损坏时仍需下载对应包。MSI 所有权安装不接受在线 standalone EXE 覆盖，请使用 MSI/Windows Installer 路径；真实 MSI 升级事务与全部历史版本直升组合尚未完成验证。

当前官方 Codex 若没有可信调试端口，文件安装成功后仍需从新版 Code-Codex 启动器重新打开；不会自动终止聊天。旧菜单无法使用时可手动下载完整 EXE。Windows 10 的相关分支有自动检查，但不等于在所有用户环境实测；本次没有真实 macOS 验收。

已验证真实 Windows 安装目录内卸载 EXE 从确认到 Finish：退出码 0、安装根完全删除、临时卸载进程/目录清理，并重新安装及确认 v0.5.6 可见文件树 ready。故障注入、浏览器与原生测试和插件公开下载完整性另有检查；不将 fixture 当全部物理环境验证。

## English

This software release covers the complete retained changes from **v0.4.52 to v0.5.7**. Standalone plugin-resource releases are not the software comparison baseline.

- **Global language:** Welcome preselects Chinese or English from the system language; switch later through Code-Codex → Language. Normal UI, context menus and plugin parameters follow the global setting. Plugin names remain English; technical errors and diagnostics remain English.
- **Custom Background:** Adds a local image/video library, per-media transforms, opacity and appearance controls, with Reset in the parameter section. Cards, libraries and settings share established styles. It works with UI Surface Opacity; opening settings preserves the library/background nodes and synchronizes video preview to the current background timeline.
- **Background transparency:** Shares file-tree, file-preview and background surface rules and covers Custom Background in file previews, official settings and secondary panels. Conversation edge masks share the existing Conversation opacity without duplicate sliders; required document content backgrounds and text readability are preserved.
- **Account transitions and startup:** Improves renderer/Bridge supervision, reconnection and recovery across sign-in/out and page replacement. Diagnostics distinguish startup, CDP, process identity, storage, network and installation phases, preserving original exceptions and recovery evidence. Bounded local operations and process qualification remain enforced.
- **Installation and removal:** Uses bilingual branded wizards, versioned root launchers and automatic attempts at live activation. Normal removal retains settings/media/plugins; Purge removes managed data and icons. The uninstall EXE and workers leave the installation working directory, fixing repeated root-lock failures after files were removed. Real remaining files still fail, with first and last causes preserved. A third-party handle on a verified empty folder produces a specific diagnostic and may leave a safe, reinstallable empty directory.
- **Plugin delivery and maintenance:** All 25 plugins have independent versions, explicit release tags, complete resource closures and size/SHA verification. Unchanged packages keep their URLs and matching caches across application updates. Missing-plugin distribution locations are corrected while existing public media remain reusable. Application composition, feature controllers, shared lifecycle, native services, preview implementations, language domains and installer sources now have clearer module ownership and regression boundaries.

### Upgrade and validation limits

EXE/ZIP users can install over the registered directory without uninstalling; settings, original media and verified matching caches are retained. Changed, missing or corrupt plugin contents still require the corresponding download. The online standalone EXE cannot overwrite an MSI-owned installation; use the MSI/Windows Installer path. A real MSI upgrade transaction and every historical direct-upgrade combination have not been validated.

An official Codex session without a verified debugging listener requires reopening through the new Code-Codex launcher after file installation; chats are not terminated automatically. Download the full EXE manually if an older menu is unavailable. Automated Windows 10 branch checks do not prove every user's environment, and no real macOS acceptance is claimed.

The actual installed Windows uninstaller was exercised from confirmation through Finish: exit code 0, complete installation-root deletion, staged-process/directory cleanup, reinstallation and a visible v0.5.6 ready tree. Fault-injection, browser/native regression and public plugin-integrity checks are separate evidence; fixtures do not establish coverage of every physical environment.

## Downloads / 下载

- `CodeCodex-0.5.7-x64-setup.exe`
- `CodeCodex-0.5.7-x64.msi`
- `CodeCodex-0.5.7-x64.zip`
- `Uninstall-CodeCodex.exe`
- `CodeCodex-plugin-catalog-0.5.7.json`
- `SHA256SUMS.txt`

Plugin assets remain pinned by the catalog to their exact existing releases. Source-code archives generated by GitHub are separate from these six uploaded assets.
