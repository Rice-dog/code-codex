# Explorer UI

Dependency-light `<code-codex>` renderer panel for Codex Desktop 26.715.x. The production build is a single self-injecting IIFE at `dist/explorer.js`; it has no runtime packages, fonts, or image assets.

## Bridge contract

Before evaluating the bundle, the native injector sets a one-use bootstrap object:

```js
window.__CODE_CODEX_BOOTSTRAP__ = {
  token: "per-launch-capability-token",
  codexVersion: "26.715.10079.0",
  channel: "stable"
};
```

The bundle freezes and removes that object as soon as it loads. Requests call `window.__codeCodex` (with `__codeCodexNative` accepted as a compatibility fallback) using this JSON envelope:

```json
{"id":"cle-…","token":"…","method":"explorer.list","params":{"relativePath":"src","limit":500}}
```

Native code delivers responses or notifications through `window.__codeCodexReceive(messageOrJson)`. Dispatching the same payload as the detail of a `code-codex:message` `CustomEvent` is also supported.

The UI uses context, directory listing, bounded text preview/save, exact-schema
workspace item actions, watcher lifecycle, and UI-settings methods.
`explorer.preview` returns at most
the native-classified first 64 KiB of strict UTF-8 text. For an existing,
complete, non-mixed-EOL eligible file, **Read only** opens a textarea;
**Editing** saves and returns to highlighted preview, while Ctrl/Cmd+S saves and
stays in the editor. `explorer.preview.save` sends the preview version plus at
most 64 KiB of UTF-8 encoded as Base64. Native code preserves BOM and consistent
LF/CRLF style and rejects stale versions.

There is no general `readFile`, `writeFile`, raw-byte, import, shell, or arbitrary
native request. The custom file/folder context menu uses only bounded create,
same-parent rename, confirmed delete, reveal, relative-path copy, and UI refresh
operations; internal tree dragging uses the exact-schema, no-overwrite move
operation. A separate owned main-surface workbench keeps Conversation mounted
and switches among at most eight open file tabs. The active read-only file is lexed
with a bounded, path-selected syntax profile and reconstructed exactly through
text nodes and fixed token spans populated with `textContent`; preview-derived
markup is never inserted. A separate aria-hidden line-number gutter stays aligned
in both read-only and editing modes without entering copied source. Plain and
unknown formats stay unstyled. All tabs and drafts are discarded on context
changes and are never saved to settings or browser storage.
Because the open Shadow DOM belongs to the Codex renderer, open-tab text must not
be treated as confidential from renderer scripts or same-user CDP inspection.
File selection and the **Read only** toggle are UI conventions, not native proof
of user intent. An authorized Codex renderer holding the launch capability can
preview/save policy-eligible paths and invoke bounded item actions without the
visible menu or confirmation. `expectedVersion` prevents stale preview-save
overwrite, not malicious renderer writes. The
native policy must authorize every request independently of current DOM state.

## Commands

```sh
npm install
npm run typecheck
npm test
npm run build
npm run demo
```

The demo runs at `http://127.0.0.1:4173` after a build and includes watcher-event controls plus a 1,250-entry paginated directory for virtualization checks.
