# Audited license text overrides

`windows-permissions` 0.2.4 declares `MIT` in its published `Cargo.toml`, but
the crates.io archive and its recorded upstream commit
`8740e4efbd88dd01046ad9c169894f3a52eb6e2c` contain no license file. The
supplemental text in this directory uses the standard SPDX MIT wording and the
author attribution published in that crate's manifest. Overrides are keyed to
an exact package name and version in `generate-third-party.mjs`; other missing
license files continue to fail the release gate.
