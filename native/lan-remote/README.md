# LAN remote native adapter (in development)

This directory is not an installed or complete plugin. The viewer reuses Aspia's
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

Network room discovery/approval, parent-owned process lifecycle, plugin UI and
packaging are still required. This entry is not exposed in Preview Market until
those paths work. Native compilation and live remote acceptance have not passed.

The adapter links Aspia and is GPL-3.0-or-later. Aspia copyright belongs to Dmitry
Chapyshev and contributors. Keep COPYING and provide the exact corresponding
source, adapter and build scripts with any binary distribution. No binary is
distributed by this change.

Reviewed upstream: `dchapyshev/aspia`, tag `v3.3.5`; its vcpkg submodule commit is
`3bfb0ca0945f72f6af254a75541daa3764a47145`. Configure Aspia as the root source
project using its vcpkg toolchain with `x64-windows-static`, and set
`CMAKE_PROJECT_aspia_INCLUDE` to this directory's absolute `project-hook.cmake`
path. First run `prepare-aspia.py` against a disposable source copy to generate
the host adaptation. Build only `code_codex_remote_viewer` and
`code_codex_remote_host`; do not run upstream CI workflows.
