# Contributing

## Local prerequisites

- Windows 11 x64
- Rust stable MSVC with `rustfmt` and Clippy
- Visual Studio Build Tools with the Desktop C++ workload
- Windows 11 SDK 10.0.26100 or newer
- Node.js 24 and npm
- .NET 8 SDK for local MSI packaging
- An installed Codex Desktop package for opt-in smoke testing

## Verify a change

```powershell
./scripts/test.ps1
```

The command installs locked UI dependencies, runs UI tests and the production UI
bundle, checks Rust formatting, treats Clippy warnings as errors, runs all Rust
tests, and verifies the generated SBOM and legal notices. Tests must not read
project file contents or connect to a real Codex renderer unless explicitly
marked as an ignored manual compatibility test.

## Development rules

- Keep the native bridge narrowly method-allowlisted; every mutation needs an
  exact schema, retained-root/no-follow enforcement, bounded work, and race tests.
- Add a security regression test for every path-validation change.
- Keep renderer adapters versioned and fixture-tested.
- Never commit Codex binaries, unpacked application resources, session data,
  credentials, real project paths, generated logs, or signing keys.
- Preserve fail-closed behavior for unknown Codex versions and ambiguous tasks.

Run `./scripts/build.ps1` before opening a pull request. Describe the Codex
Desktop version used for any manual CDP smoke test.

After changing a dependency, run `node scripts/generate-third-party.mjs` after a
successful Cargo build and commit both generated legal files. The verification
gate rejects stale notices.
