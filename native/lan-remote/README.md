# LAN Remote native adapter

The optional LAN Remote plugin reuses Aspia's
desktop and file-transfer windows and encrypted native transport. It accepts one
JSON line through its parent's private stdin pipe, with `address` (IPv4 literal),
`port`, `username`, `password` and `mode` (`desktop` or `files`). It does not accept
credentials on the command line, modify an existing Aspia address book, or start
a cloud router. Only the approved room controller may launch it.

`host.cc` and `prepare-aspia.py` adapt the existing portable host worker to a
direct listener using one approved SRP identity. Capture, encoding, input, audio
and file workers retain upstream wiring. The generated wiring preserves the
upstream notice. Source preparation accepts only the reviewed source copy and
rejects applying twice; never run it on an installed Aspia directory. The host
configuration uses the viewer's address/port/username/password fields plus a
`files` boolean, without `mode`. It currently provides full control, not a
server-enforced view-only mode. No UI should offer view-only until enforcement
is implemented and verified.

`room_state.h` owns pending requests and grants without timers or network work.
Its tests cover duplicate requests, no automatic approval, permission reduction,
single controller, concurrent-create election metadata, revoke and cleanup.
These are state tests, not screen/input/network acceptance.

`room.cc` provides private IPv4 discovery on UDP34591 and encrypted SRP approval.
Enter the same six digits on both PCs. The first device creates a room after a
single 350 ms absence window; existing rooms connect immediately on discovery.
To join a specific host, include its private or Tailscale IPv4 literal as
`address` on the existing `open` command. This sends one unicast query to UDP
34591, accepts the requested address and corresponding nonce, and uses the same
encrypted approval path. If the host does not answer within three seconds, the
request fails without creating a room. The peer must already be reachable via the
local or overlay network; Windows Firewall must allow the discovery port and the
application's native listeners. No public port is opened automatically.
The host must explicitly approve the requester. Approval includes desktop control
and file transfer; one controller is allowed at a time. Either side can leave;
the host can revoke. Disabling the plugin releases its room and owned processes.
No unattended service, cloud router or automatic firewall exemption is installed.
Wi-Fi client isolation and Windows Firewall may prevent connections. Use a trusted
LAN and check the requester: the room code alone is not authorization.

Two fixed executables preserve Aspia's client/host library boundaries:
`code_codex_lan_remote.exe` owns room discovery/approval and its host child;
`code_codex_remote_viewer.exe` provides the original desktop/file windows.
Code-Codex owns their complete process tree through its existing Job Object.
Viewer settings use an in-memory database. Wallpaper/effects are preserved.
Diagnostics exclude credentials, screens, clipboard and file contents.
It runs as the current user; secure-desktop/UAC control is not offered.

`scripts/test-lan-remote-ui.mjs` uses production UI with simulated native replies.
`scripts/test-lan-remote-native.py` opens actual encrypted desktop/file sessions
between two owned loopback processes, then revokes access. Its CLI-only test mode
avoids input focus, clipboard and audio feedback on the same PC. Two physical PCs,
real input/file copy, audio and multiple displays need separate acceptance;
compilation and source presence alone do not prove these capabilities.

The adapter links Aspia and is GPL-3.0-or-later. Aspia copyright belongs to Dmitry
Chapyshev and contributors. Keep COPYING and provide the exact corresponding
source, adapter and build scripts with any binary distribution. No binary is publicly
distributed by this local task.

Reviewed upstream: `dchapyshev/aspia`, tag `v3.3.5`; its vcpkg submodule commit is
`3bfb0ca0945f72f6af254a75541daa3764a47145`. Configure Aspia as the root source
project using its vcpkg toolchain with `x64-windows-static`, and set
`CMAKE_PROJECT_aspia_INCLUDE` to this directory's absolute `project-hook.cmake`
path. First run `prepare-aspia.py` against a disposable source copy to generate
the host adaptation. Use `build.ps1` with explicit SourceRoot/VcpkgRoot/BuildRoot,
optional short BuildTreesRoot and DownloadsRoot/BinaryCacheRoot. Pass
`-PrepareSource` only for a fresh disposable source copy; omit it when resuming.
It builds `code_codex_lan_remote` and `code_codex_remote_viewer`, and emits COPYING
and a receipt binding actual source/binary hashes. The optional package builder
rejects stale receipts. Supply corresponding upstream/dependency source and these
adapters/build scripts with binary distributions. Do not run upstream CI.
