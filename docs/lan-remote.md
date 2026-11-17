# 局域网远控 / LAN Remote (Beta)

## 简体中文

1. 两台电脑安装 Code-Codex，在插件市场 → 工具中下载并启用“局域网远控（测试）”。远控原生程序按需下载，不内置在主安装包。
2. 房主输入六位房间码，点击“创建 / 加入”。同一局域网的另一台电脑输入相同房间码，点击同一按钮申请加入。
3. 也可在加入端填写“房主地址”，输入房主 IPv4 地址并保留相同房间码，点击“按地址加入”。它只向该地址查找，不创建房间；失败时可重新操作。两端必须已经网络可达，私有地址本身不能穿越不同网络。
4. 房主核对申请后点击“同意控制”，加入端使用原生远控窗口。审批包含远程控制和文件传输；同一时间一个控制者。可拒绝、断开或离开房间；停用插件释放房间和进程。关闭设置窗口不退出房间。

UDP 34591 用于发现，后续加密连接使用原生监听端口。无线客户端隔离或系统防火墙可能阻止连接，插件不自动修改防火墙。不提供无人值守服务、云端中转或安全桌面/UAC控制。测试标签表示仍需两台实体电脑验收网络、真实输入/文件复制、音频和多屏；本机回环与界面夹具不能代替这些验收。

核心采用 MIT。可选原生远控程序及适配代码采用 GPL-3.0-or-later，基于 Dmitry Chapyshev 及贡献者的 Aspia v3.3.5。其版权和许可证不属于 Code-Codex 的 MIT 授权。[同一资源发布](https://github.com/Rice-dog/code-codex/releases/tag/plugin-assets-2026-11-15)提供 COPYING 和 `CodeCodex-plugin-lan-remote-1.0.3-source.zip`，包含对应上游、适配、依赖源码、版本/哈希、许可证和构建入口。源码仅供下载/构建，不是运行时需要下载的插件资源。

## English

1. Install Code-Codex on both PCs. Download and enable LAN Remote (Beta) under Tools in the plugin market. Native remote executables download on demand, separately from the core installer.
2. The host enters a six-digit room code and selects Create / Join. On the same LAN, the other PC uses the same code and button to request access.
3. Alternatively, enter the host IPv4 in Host address, keep the same room code, and choose Join by address. This looks only at that address and does not create a room. Both PCs must already be reachable; a private address alone does not cross separate networks.
4. The host checks the request and allows control. The guest uses the native remote window. Approval includes desktop control and file transfer, with one controller at a time. Reject, disconnect, leave or disable to release access. Closing settings preserves the room; disabling releases its processes.

Discovery uses UDP 34591; encrypted native connections use their listening ports. Wi-Fi client isolation or a firewall may block access. The plugin makes no automatic firewall changes and provides no unattended service, cloud relay or secure-desktop/UAC control. Beta status retains physical-PC network, actual input/file copy, audio and multi-monitor acceptance limits; loopback and UI fixtures do not establish those results.

The core is MIT. Optional native remote executables and adapters derive from Aspia v3.3.5 by Dmitry Chapyshev and contributors under GPL-3.0-or-later; the core MIT license does not override their copyright or licensing. The [same resource release](https://github.com/Rice-dog/code-codex/releases/tag/plugin-assets-2026-11-15) provides COPYING and `CodeCodex-plugin-lan-remote-1.0.3-source.zip`, with corresponding upstream, adapter and dependency sources, versions/hashes, licenses and build instructions. This source download is for rebuilding, not a required runtime plugin asset.
