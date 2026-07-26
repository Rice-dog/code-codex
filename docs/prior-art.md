# Prior art and design choice

The project intentionally chooses an embedded, runtime-only enhancement over a
separate IDE or a repackaged Codex build. App Server clients demonstrate supported
thread and filesystem protocol patterns, while other CDP desktop enhancements
demonstrate feasibility; no third-party implementation code or official unpacked
assets are copied.

See the original Chinese design proposal for the evaluated alternatives and
source links: `Codex-Live-Explorer-设计提案.md`.

The supported App Server is used for thread metadata. CDP and renderer DOM
integration remain undocumented compatibility layers, so they are isolated,
versioned, and designed to fail closed.
