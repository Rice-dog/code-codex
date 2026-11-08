# Code-Codex v0.6.0

本次软件更新覆盖上一公开软件版本 **v0.5.89 → v0.6.0** 的保留改动；中间的本地候选版本不单独计为公开更新。[完整源码比较](https://github.com/Rice-dog/code-codex/compare/v0.5.89...v0.6.0)。

## 简体中文

- **新版官方客户端兼容**：完善原生工作区、活动页面、输入框和模型按钮识别，适配新版文件树挂载结构；保留旧接口适配，按实际能力与响应合同判断兼容性。
- **启动与连接恢复**：补齐启动冲突、Bridge派发、响应截止和官方后台传输诊断，保留具体阶段与证据，继续保护活动任务和已有登录状态。
- **官方更新变更台账**：启动时按官方版本转换触发分析并记录已处理转换，避免重复扫描；按插件依赖标注可能受影响的部分，保存报告与基线。静态影响信号不替代功能实测，也不保证自动修复未来破坏性接口变化。
- **顶部菜单**：新增通过Code-Codex启动链重启应用的入口，将开机自启、重启、卸载集中排列，改善自启状态读取时的显示稳定性，普通界面继续跟随中英文设置。
- **透明度与主题**：完善新版官方页面、上下渐变遮罩和设置底板适配，恢复时只处理本插件拥有的状态，复用现有主题与原生能力。
- **插件资源下载**：补齐目录锁定的两项独立运行资源后再发布软件，沿用原tag、文件名、大小和SHA256校验，保留其他插件的独立版本与缓存身份。
- **安装与交接**：完善安装、卸载和运行期交接的阶段信息，保留设置、素材及校验匹配的插件缓存；活动任务继续受保护，热接管可能等到任务空闲后完成。

本轮按要求**未运行CLI自动化测试或CI**。发布操作包括编译打包、公开资源与匿名下载完整性核对、本机安装及运行界面核对；此前测试记录不作为本轮重新测试结果。真实模型调用、登录授权、额度兑换及所有官方客户端/系统组合未在本轮重新验收。

## English

This release includes the retained changes since the previous public software release, **v0.5.89 → v0.6.0**. Intermediate local candidates are not separate public updates. [Full source comparison](https://github.com/Rice-dog/code-codex/compare/v0.5.89...v0.6.0).

- **Current official-client compatibility**: Improved qualification of native workspaces, active pages, composers and model controls, plus updated file-tree placement. Legacy adapters remain available, with compatibility decided by observed capabilities and response contracts.
- **Startup and connection recovery**: Added stage-specific diagnostics for startup conflicts, Bridge dispatch, response deadlines and official backend transport, while preserving active tasks and existing sign-in state.
- **Official-update change ledger**: Startup analysis follows official version transitions and records processed transitions to avoid duplicate scans. Reports and baselines identify potentially affected plugin dependencies. Static signals do not replace functional validation or guarantee automatic repair of future breaking interfaces.
- **Application menu**: Added restart through the managed Code-Codex launch chain. Login startup, restart and uninstall are grouped together, with more stable startup-state presentation and existing Chinese/English localization.
- **Opacity and themes**: Improved current official-page, gradient-mask and settings-surface adaptation. Restoration is limited to owned state and reuses existing theme and native capabilities.
- **Plugin downloads**: Published the two exact missing runtime assets before the software release. Pinned tags, filenames, sizes and SHA256 checks remain intact, along with other plugins' independent versions and cache identities.
- **Installation and handoff**: Improved installation, removal and runtime-handoff diagnostics while retaining settings, media and verified caches. Active tasks stay protected; hot activation may wait until they are idle.

As requested, **no CLI automated tests or CI were run for this release**. Release operations cover compilation, packaging, public-resource integrity, anonymous downloads, local installation and runtime-interface observation. Earlier test records are not presented as newly executed release tests. Live model calls, authorization, quota redemption and every official-client/OS combination were not revalidated in this round.
