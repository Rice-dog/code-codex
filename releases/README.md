# Code-Codex v0.6.13

## 简体中文

本次更新覆盖上一公开软件版本 **v0.6.0 → v0.6.13** 的累计改动；中间的本地版本不算单独公开更新。[完整源码比较](https://github.com/Rice-dog/code-codex/compare/v0.6.0...v0.6.13)。

- **安装器欢迎页检查更新**：一行显示检测中、发现新版、已是最新版或检测失败。有新版时可勾选下载，取消则安装自带版本；下载完成后核对来源、大小与 SHA-256，再进入新版安装。成功后尝试更新原来保存的 setup 文件，保留以后再次检查更新的入口。
- **官方更新兼容验收**：在原变更台账上增加真实安装包/宿主只读检查、受控正负例和逐功能结果。区分无影响、检查通过、发现问题和待手测，合并重复手测步骤；未知变化及未覆盖的行为继续明确列出。启动仍按官方版本变化去重，不因规则更新自动重复扫描。
- **连接与运行恢复**：修复退休连接残留和文档能力所有者更新的问题，改善后台交接和状态恢复，保留活动任务、设置、素材与有效插件缓存。
- **设置页面背景**：通过共用的原生页面结构适配设置与部分侧栏页面背景，保留控件、菜单和主题的原有行为。
- **插件下载提示与资源**：普通界面根据中英文设置，区分网络连接、服务器繁忙、限流、缺失文件、配置、存储和完整性问题，给出更易懂的处理建议。补齐当前目录锁定但尚未公开的资源；继续按精确大小和 SHA-256 校验，保留未变化插件的缓存。

沿用本机已完成构建与验证的核心程序，不为发布重复编译或运行 CI。此前本机检查覆盖类型检查、相关回归、受控浏览器、隔离官方后台合同与实际宿主只读检查；发布另行核对资源、安装包与公开下载完整性。部分自动检查通过不等于全部功能验收：真实远端模型调用、额度耗尽、网络切换、多对话并发、所有历史升级路径及全部系统/官方版本组合仍有未验收范围。报告中待手测的项目继续保留，不宣称未来官方更新必然兼容。

## English

This release covers the cumulative retained changes from the previous public software release, **v0.6.0 → v0.6.13**. Intermediate local versions are not separate public updates. [Full source comparison](https://github.com/Rice-dog/code-codex/compare/v0.6.0...v0.6.13).

- **Update checks on the setup welcome page**: One line shows progress, a newer version, an up-to-date installer or a failed check. Select the download option for the new version, or clear it to install the bundled version. Setup verifies the download source, size and SHA-256 before launching the newer installer. After success, it attempts to update the original saved setup file for future update checks.
- **Official-update compatibility validation**: Added read-only checks against the actual installed package and host, controlled positive/negative cases and per-feature results to the existing change ledger. Results distinguish no impact, checks passed, issues found and manual validation required, with duplicate manual steps grouped together. Unknown changes and uncovered behavior remain explicit. Startup still deduplicates official-version transitions; a rules update does not automatically rescan the same version.
- **Connection and runtime recovery**: Fixed stale retired connections and document-capability ownership updates, improving backend handoff and state recovery while retaining active tasks, settings, media and valid plugin caches.
- **Settings backgrounds**: Shared native page structure now handles settings and additional sidebar-page backings while preserving controls, menus and theme behavior.
- **Plugin download guidance and resources**: User-facing messages follow the Chinese/English language setting and distinguish connection problems, busy servers, rate limits, missing files, configuration, storage and integrity errors with clearer next steps. Published resources already pinned by the current catalog but previously absent online. Exact size/SHA-256 verification and unchanged plugin caches remain intact.

The release reuses the core already built and validated locally, without redundant compilation or CI. Earlier local validation covered type checking, relevant regressions, controlled browser checks, an isolated official-backend contract and read-only checks in the actual host; release operations separately verify resources, packages and public downloads. Passing automated subchecks does not certify every feature: live remote model calls, quota exhaustion, network switching, concurrent conversations, every historical upgrade path and all OS/official-client combinations still have unvalidated scope. Required manual checks remain visible; future official updates are not guaranteed compatible.
