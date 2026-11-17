# Code-Codex v0.6.33

## 简体中文

累计更新范围：上一公开软件版本 **v0.6.27 → v0.6.33**。[完整源码比较](https://github.com/Rice-dog/code-codex/compare/v0.6.27...v0.6.33)。

- **新增局域网远控插件（测试）**：在插件市场的工具分类按需下载。两台电脑输入相同六位房间码，首台创建房间，另一台申请加入；房主同意后开启远程桌面控制与文件传输。也可填写房主 IPv4 地址，使用同一房间码定向申请加入。按地址加入要求两端已经网络可达，不会自行组网。
- **统一远控设置界面**：房间码与房主地址均提供标签、占位提示及行下说明；卡片和设置标题显示“测试 / Beta”。空闲时不显示底部状态占位，连接进度、审批和错误信息继续显示。普通关闭面板不退出房间，停用插件会关闭自己拥有的房间和进程。
- **复用现有能力**：远控使用 Aspia 的原生桌面和文件窗口、加密传输，设置使用现有插件面板与中英文本地化。原生程序只随可选远控插件下载，核心安装包不包含这两份远控程序。
- **更新兼容检测**：补充远控市场、Bridge、生命周期和具体界面验收范围；规则版本与官方版本分别记录，保留历史报告，不因规则更新自动重扫同版本官方包。

**测试范围与限制**：生产 Chromium 界面夹具 15 项通过，使用模拟原生回复；原生回环桌面/文件会话 10 项和 Bridge 2 项在此前对应实现中通过。安装包已安装到本机，16 项应用文件及 4 项插件资源核对一致。已确认当前窗口由 0.6.33 接管，文件树与 Bridge 正常；设置面板实际展开后的视觉验收尚未复测。两台实体电脑的网络/防火墙、实际键鼠与文件复制、音频、多屏，以及真实官方更新/卸载仍需验收。远控不提供无人值守服务或云端中转，不自动开放防火墙，不支持安全桌面/UAC控制。未运行 CI。

**许可证与源码**：核心继续采用 MIT；可选远控原生程序基于 Dmitry Chapyshev 及贡献者的 Aspia v3.3.5，适用 GPL-3.0-or-later。对应上游源码、适配代码、依赖源码、许可证和构建说明在[远控资源发布](https://github.com/Rice-dog/code-codex/releases/tag/plugin-assets-2026-11-15)提供。安装说明见[远控指南](https://github.com/Rice-dog/code-codex/blob/v0.6.33/docs/lan-remote.md)。

更新方式：点击文件树右下角版本号，或下载本页的 setup、MSI、ZIP。完整性校验见 `SHA256SUMS.txt`。

## English

Cumulative changes from the previous public software release, **v0.6.27 → v0.6.33**. [Full source comparison](https://github.com/Rice-dog/code-codex/compare/v0.6.27...v0.6.33).

- **New LAN Remote plugin (Beta)**: Download it on demand from Tools in the plugin market. Enter the same six-digit room code on both PCs: the first creates a room, the other requests access. The host must approve before desktop control and file transfer become available. A host IPv4 address can also direct the request using the same room code. Address-based joining requires existing network reachability; it does not create an overlay network.
- **Consistent remote settings**: Both room code and host address have labels, placeholders and help below their row. The card and settings title show a Beta badge. Idle status leaves no footer space; progress, approval and errors remain visible. Closing settings preserves the room; disabling the plugin releases its own room and processes.
- **Reuse of existing capabilities**: Remote sessions use Aspia's native desktop/file windows and encrypted transport; settings reuse the existing plugin panel and bilingual localization. The two native remote executables download only with the optional plugin and are excluded from the core installer.
- **Update compatibility coverage**: Added remote-market, Bridge, lifecycle and concrete UI acceptance coverage. Rule revisions remain distinct from official versions; historical reports are preserved, without automatically rescanning the same official version after a rule update.

**Validation and limits**: All 15 production Chromium UI fixture checks passed using simulated native replies. Ten native loopback desktop/file-session checks and two Bridge checks passed on the corresponding earlier implementation. The installer was installed locally; 16 application files and four plugin resources matched their packaged bytes. The current window is now owned by 0.6.33, with its file tree and Bridge ready; visual acceptance of the expanded settings panel has not been repeated. Two-physical-PC networking/firewalls, actual input/file copy, audio, multiple monitors, real official updates and uninstall still require acceptance. Remote sessions provide no unattended service or cloud relay, make no automatic firewall changes and do not support secure-desktop/UAC control. No CI was run.

**Licensing and source**: The core remains MIT. Optional native remote executables derive from Aspia v3.3.5 by Dmitry Chapyshev and contributors, under GPL-3.0-or-later. Corresponding upstream, adapter and dependency sources, licenses and build instructions accompany the [remote resource release](https://github.com/Rice-dog/code-codex/releases/tag/plugin-assets-2026-11-15). See the [remote guide](https://github.com/Rice-dog/code-codex/blob/v0.6.33/docs/lan-remote.md).

Update using the version at the bottom-right of the file tree, or download this release's setup, MSI or ZIP. Verify downloads against `SHA256SUMS.txt`.
