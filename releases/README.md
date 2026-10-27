# Code-Codex v0.5.39

本次软件更新覆盖上一公开软件版本 **v0.5.21 → v0.5.39** 的全部保留变更，包括 PR66、PR67 及其后续修正。期间本地测试版本不另算公开软件更新。

## 简体中文

- **原版已运行时的恢复**：继续使用同一个启动诊断窗口，直接显示完整的“关闭并重新启动 / 取消”操作。默认取消，确认后窗口立即隐藏；按保留的进程身份请求正常退出，再检查后继进程、页面及 Bridge 就绪。可记住自动重启选择，也可撤销；开启开机自启不会自动授予关闭会话的权限。
- **慢启动与动画等待**：正常较慢启动不再被独立的 90 秒恢复计时器误报。首次主页面尚未挂载时，超过 120 秒观察门槛继续等待，不再仅因时间流逝关闭客户端。过长的启动动画让出原生界面；它不会伪造就绪、修改网络设置或自动重试关闭操作。真正的身份、安全和启动失败仍保留诊断。
- **进程检错与诊断**：改进既有进程查询、退出收尾及过期快照竞争的处理，保留同代句柄、完整快照和总预算约束；明确区分尚未就绪、实际退出、查询失败和页面资格失败。技术原因、错误码与原始日志保留英文，普通操作说明随界面语言显示。
- **安装与桌面入口**：始终创建独立的 Code-Codex 桌面快捷方式；找到原生 Codex 快捷方式时继续支持接管及卸载恢复。没有原生桌面图标也能使用独立入口，有效受管记录中的入口丢失可修复。
- **顶部菜单与开机自启**：菜单选中高亮、已展开时悬停切换更接近原生行为；开机自启使用右侧标准勾选和居中的简洁中英确认框。菜单 Bridge 独立于文件树生命周期，隐藏文件树后仍可操作自启和卸载入口。
- **卸载流程**：顶部 Code-Codex 菜单可直接打开现有卸载向导。修正从运行中的菜单启动卸载时的进程链处理，保护暂存向导、worker 和完成页 UI，按用户选择保留或删除设置、插件和素材。
- **插件显示与图片轮换**：26 款插件名称随全局中英文显示；避免旧语言服务在热升级后覆盖新目录。修复 Particle Image 自动图片轮换与外观操作共享忙碌状态的问题，启用、导入或删除后的轮换能够恢复。
- **升级与缓存**：26 个插件的独立版本、固定资源地址及资源字节保持不变；校验匹配的下载缓存可复用。EXE 更新沿用原安装目录，并保留设置、用户素材和匹配插件，无需先卸载；MSI 所有权安装继续走 Windows Installer 路径。

### 安装与验证范围

优先下载 `CodeCodex-0.5.39-x64-setup.exe`；另提供 MSI、ZIP、独立卸载程序、插件目录和 SHA256 清单。插件实际代码及媒体继续按目录中锁定的既有资源 tag 下载，不随软件版本统一改地址。

已执行原生 CDP/恢复、菜单、语言升级、安装器与卸载生命周期等回归；627 项本机 Rust 测试通过、5 项按条件忽略，来自串行工作区执行及解除窗口遮挡后的单项补测。CI 与真实宿主安装/热激活分别核对，安装包和下载附件核验大小、SHA、版本字段及内嵌内容。测试替身不代表所有真实客户端和系统环境均已验证。

实际 Windows 登录自启且未开代理的冷启动、所有历史版本逐一原地升级、完整 MSI 升级事务及其他 GPU/Windows 环境尚未全面实测。此前官方页面迟迟未挂载的具体网络原因仍未证明；本次改进等待和诊断机制，不承诺解决所有网络或官方客户端初始化问题。

## English

This software release includes all retained changes from the previous public software release, **v0.5.21 to v0.5.39**, including PR66, PR67 and the subsequent maintainer corrections. Intermediate local test builds are not separate public software releases.

- **Recovery when stock Codex is already running:** The shared diagnostic initially presents the complete Close and restart / Cancel controls. Cancellation is the default; an explicit restart immediately hides the window, requests graceful exit using the retained process identity, then checks the successor, renderer and Bridge readiness. Remembered restart consent is revocable and independent of login startup.
- **Slow startup and animation waiting:** The independent 90-second recovery timer no longer reports healthy delayed startup as failure. An owned launch keeps waiting for an initially unmounted native page beyond its 120-second observation threshold without terminating Codex merely because time elapsed. A prolonged animation yields to the native interface without inferring readiness, changing network settings or automatically repeating a close request. Genuine identity, security and launch failures remain diagnosable.
- **Process inspection and diagnostics:** Improves existing-instance inspection, teardown and stale-snapshot races while retaining same-generation handles, complete snapshots and total budgets. Separates pending readiness, actual exit, query failures and renderer qualification. Technical reasons, support codes and raw logs remain English; ordinary guidance follows the selected UI language.
- **Installation and desktop entry:** Always creates an independent Code-Codex desktop shortcut, alongside takeover/restoration of an available original shortcut. A stock desktop icon is no longer required for the independent entry, and missing managed entries can be repaired.
- **Top menu and login startup:** Adds native-style selection highlighting and hover switching, a standard right-aligned check and a centered concise bilingual confirmation. The menu Bridge survives file-tree dismissal, preserving login-startup and uninstall actions.
- **Uninstall lifecycle:** The top menu opens the existing uninstall wizard. Corrects process-chain selection when uninstall starts from a running session, protecting the staged wizard, worker and completion UI while respecting the user's data-retention choice.
- **Plugin labels and image rotation:** Localizes all 26 plugin display names with the global language and prevents an old injected language service from replacing the upgraded catalog. Fixes Particle Image auto-rotation sharing the appearance busy state, including resumption after enable, import and deletion.
- **Upgrade and cache reuse:** Retains all 26 independent plugin versions, pinned asset addresses and resource bytes. Matching verified caches remain reusable. EXE updates reuse the installation root and preserve settings, user media and matching plugins; MSI-owned installations retain the Windows Installer path.

### Installation and verification scope

Prefer `CodeCodex-0.5.39-x64-setup.exe`; MSI, ZIP, a standalone uninstaller, plugin catalog and SHA256 manifest are also provided. Plugin code/media continue using their existing exact catalog tags rather than being repointed to the software version.

Native CDP/recovery, menus, localization, installer and uninstall lifecycle regressions were exercised. The 627 local Rust passes and 5 conditional ignores combine a serial workspace run with a follow-up of the previously occluded interactive test. CI, actual host installation/hot activation and package/download integrity are verified separately. Fixtures are not evidence that every client/system configuration works.

A real Windows-login startup with no proxy, every historical in-place upgrade, a full MSI upgrade transaction and other GPU/Windows environments have not all been exercised. The network cause of the earlier unmounted official page remains unproven; these changes improve waiting and diagnostics rather than guaranteeing all network or official-client initialization failures are resolved.
