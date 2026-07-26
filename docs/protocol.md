# Native bridge protocol

The CDP connector installs one binding named `__codexLiveExplorer`. The injected
bundle reads a one-time bootstrap capability and immediately removes the bootstrap
object from `window`.

## Request

```json
{
  "id": "req-42",
  "token": "per-launch-random-capability",
  "method": "explorer.list",
  "params": { "relativePath": "src", "cursor": "v1.200", "limit": 250 }
}
```

The native side returns data by evaluating
`window.__codexLiveExplorerReceive(message)`. Successful and failed responses are:

```json
{ "id": "req-42", "ok": true, "result": {} }
```

```json
{
  "id": "req-42",
  "ok": false,
  "error": { "code": "INVALID_PATH", "message": "The relative path is invalid." }
}
```

Notifications omit `id` and `ok`:

```json
{
  "method": "explorer.changed",
  "params": {
    "changes": [{ "relativePath": "src/main.rs", "kind": "modified" }]
  }
}
```

## Allowlisted methods

| Method | Purpose |
|---|---|
| `explorer.context` | Resolve the selected thread and return safe root display metadata. |
| `explorer.context.clear` | Revoke the active workspace and stop its watcher for a cloud/no-task state. |
| `explorer.list` | Return one bounded page of all direct child path metadata, including hidden and ignored entries. |
| `explorer.preview` | Return a fixed-policy, bounded text preview for one relative file path. |
| `explorer.preview.save` | Version-check and save one existing, complete preview-eligible text file. |
| `explorer.entry.create` | Exclusively create one empty file or one directory below a validated parent. |
| `explorer.entry.rename` | Rename one existing entry within its current parent without overwrite. |
| `explorer.entry.move` | Move one existing entry into a validated workspace folder without overwrite. |
| `explorer.entry.delete` | Delete one existing non-root entry through bounded no-follow traversal. |
| `explorer.entry.reveal` | Reveal one validated existing entry through a fixed Windows Explorer invocation. |
| `explorer.watch.start` | Start or replace the watcher for the resolved workspace. |
| `explorer.watch.stop` | Stop the active watcher. |
| `explorer.settings.get` | Read non-sensitive panel preferences; legacy visibility fields may appear but are ignored. |
| `explorer.settings.set` | Validate and persist non-sensitive panel settings; legacy visibility fields are accepted but ignored. |

There is intentionally no general `readFile`, `writeFile`, raw-byte, import,
search, shell, command, credential, or arbitrary native-dispatch method. Content
access remains limited to bounded `explorer.preview` and the narrow
`explorer.preview.save`; item changes use only the five exact operations below.

## Directory visibility

Listing and watcher coverage always include hidden and ignore-matched files and
folders, including `.git`. The renderer has no visibility filter control.
`showHidden` and `showIgnored` may still be accepted in settings payloads and
returned for compatibility with older installations, but their values do not
change listing or watcher behavior.

## Bounded text preview

The request schema is exact; unknown fields and renderer-selected limits are
rejected:

```json
{
  "id": "req-43",
  "token": "per-launch-random-capability",
  "method": "explorer.preview",
  "params": { "relativePath": "src/main.rs" }
}
```

A supported file returns literal text and native file metadata:

```json
{
  "kind": "text",
  "text": "fn main() {}\n",
  "sizeBytes": 13,
  "truncated": false,
  "editable": true,
  "version": "536e506bb90914c243a12b397b9a998f85ae2cbd9ba02dfd03a9e155ca5ca0f4",
  "lineEnding": "lf"
}
```

An ineligible file is a successful, non-content response rather than a bridge
error:

```json
{
  "kind": "unsupported",
  "sizeBytes": 1482,
  "truncated": false,
  "reason": "sensitive"
}
```

`reason` is one of `sensitive`, `unsupported-type`, `binary`, or
`invalid-utf8`. Native code samples at most 65,537 bytes: a 65,536-byte return
budget plus one sentinel byte used only to detect truncation. At most 65,536
bytes are returned, and a longer supported text file sets `truncated: true`.
`sizeBytes` is the length reported by the retained file handle, not a
renderer-provided value.

For `kind: "text"`, `lineEnding` is `none`, `lf`, `crlf`, or `mixed`.
`editable` is true only for a complete file no larger than 64 KiB with a
version and non-mixed line endings. `version` is the lowercase SHA-256 of exact
disk bytes, including any leading UTF-8 BOM and original line endings. Preview
text omits the BOM for display.

Native code validates the relative path, opens each parent through retained
no-follow directory handles, opens the final regular file handle-relative with
no-follow semantics, and rejects all symlinks, junctions, and other reparse
points. Accepted content must be strict UTF-8 and contain no NUL byte. The
renderer may lex known path-selected languages for cosmetic color, but it
reconstructs `text` exactly through text nodes and fixed spans populated with
`textContent`. It never renders or executes active HTML, Markdown, SVG, scripts,
or links from preview content.

The UI sends this request after a deliberate selection, but that gesture is a UX
convention rather than a native authorization primitive. Native code authenticates
the renderer document and launch capability, not a physical click; a renderer
holding that capability can request any relative path that passes the native
policy below.

## Bounded preview save

The exact save request contains no caller-selected root, encoding, flags, or
limit:

```json
{
  "id": "req-44",
  "token": "per-launch-random-capability",
  "method": "explorer.preview.save",
  "params": {
    "relativePath": "src/main.rs",
    "expectedVersion": "536e506bb90914c243a12b397b9a998f85ae2cbd9ba02dfd03a9e155ca5ca0f4",
    "contentBase64": "Zm4gbWFpbigpIHt9Cg=="
  }
}
```

`contentBase64` is standard Base64 for the complete replacement UTF-8 text and
decodes to at most 65,536 bytes. The binding accepts at most 96 KiB for the whole
request so a maximum-size Base64 edit fits but ingress remains bounded. A
successful save returns the same preview-result shape with a new `version`.

Native code permits a save only when the existing target is a complete,
preview-eligible regular file no larger than 64 KiB. It revalidates the relative
path, retained workspace, sensitive/type policy, strict UTF-8/NUL checks, and all
ancestor/final no-follow and reparse constraints. Mixed line endings in either
the existing file or replacement are rejected. An existing UTF-8 BOM and the
previewed LF/CRLF style are preserved by the UI/native path.

Before writing, native code hashes the current exact bytes and requires them to
match `expectedVersion`; otherwise it returns `CONFLICT`. This prevents stale
overwrites but does not authorize a physical UI gesture: a Codex renderer with
the valid launch capability can preview, obtain versions, and save eligible
paths even if it never clicks **Read only**. Saving updates the retained file
handle in place and calls `fsync`; it preserves file identity and ACLs but is not
crash-atomic. This save route cannot create, delete, rename, move, or write any
other path.

The native policy is case-insensitive. A basename beginning with `.env`; an exact
basename of `.npmrc`, `.pypirc`, `.netrc`, `_netrc`, `credentials`,
`credentials.json`, or `secrets.json`; an SSH private-key basename of `id_rsa`,
`id_dsa`, `id_ecdsa`, `id_ed25519`, or `id_xmss` (including suffixed variants);
or one of these extensions is always `sensitive`:

```text
pem key pkey ppk pk8 der crt cer csr p12 pfx jks keystore kdb kdbx gpg pgp
```

After that denylist, these exact basenames are eligible:

```text
.babelrc .browserslistrc .dockerignore .editorconfig .eslintignore .eslintrc
.gitattributes .gitignore .gitmodules .node-version .npmignore .nvmrc
.prettierignore .prettierrc .python-version .ruby-version .stylelintignore
.stylelintrc .tool-versions authors brewfile changelog changes code_of_conduct
containerfile contributing contributors copying dockerfile gemfile gnumakefile
history justfile license makefile notice procfile rakefile readme security
taskfile vagrantfile
```

An extensionless basename beginning with `license-` or `licence-` is also
eligible. Otherwise, the final extension must be in this allowlist:

```text
txt text log md markdown mdx rst adoc asciidoc tex diff patch
ts tsx mts cts js jsx mjs cjs py pyi pyw rs go java kt kts swift
c h cc cpp cxx hpp hxx cs fs fsx vb php rb rake lua pl pm r dart
scala sc groovy gvy ex exs erl hrl clj cljs cljc edn hs lhs ml mli
sol zig nim jl sh bash zsh fish ps1 psm1 psd1 bat cmd
html htm css scss sass less styl vue svelte astro hbs handlebars mustache
ejs njk jinja jinja2 j2 liquid twig
xml xsl xslt xsd wxs wxl wxi csproj fsproj vbproj vcxproj wixproj props
targets resx plist json jsonc json5 yaml yml toml ini cfg conf config
properties csv tsv sql graphql gql proto lock sum mod cmake gradle sbt mk
make ipynb
```

Unsupported media, archives, executables, databases, and office documents never
return bytes. Clients must not infer preview eligibility from UI icons.

## Bounded workspace item actions

Every action request has an exact schema. Unknown fields, absolute paths,
traversal, UNC/device/ADS spellings, mixed or repeated separators, NULs, reserved
Windows device names, and components ending in a dot or space are rejected. A
new leaf name must be exactly one normal component and at most 255 UTF-16 code
units. The renderer cannot provide a destination directory for rename, an
overwrite flag, delete mode, executable, or command-line arguments.

Create one empty file or directory under an existing directory:

```json
{
  "id": "req-45",
  "token": "per-launch-random-capability",
  "method": "explorer.entry.create",
  "params": {
    "parentRelativePath": "src",
    "name": "new-file.ts",
    "kind": "file"
  }
}
```

`kind` is exactly `file` or `directory`. The empty parent path denotes the
workspace root. File creation is exclusive and directory creation adds only one
level, so an existing destination is never truncated or replaced. Success
returns the new entry's `relativePath`, `name`, and `kind`.

Rename one existing entry within its current parent:

```json
{
  "id": "req-46",
  "token": "per-launch-random-capability",
  "method": "explorer.entry.rename",
  "params": { "relativePath": "src/old.ts", "newName": "new.ts" }
}
```

The current path must be non-empty, so the workspace root cannot be renamed.
Only the leaf changes; this method cannot move an entry between directories or
replace an existing destination. Regular-file rename uses capability-relative
hard-link creation followed by removal of the old name, so destination creation
is no-clobber but the two-step operation is not crash-atomic and requires
filesystem hard-link support. Success returns the renamed entry.

Move one existing entry into another workspace directory:

```json
{
  "id": "req-47",
  "token": "per-launch-random-capability",
  "method": "explorer.entry.move",
  "params": {
    "relativePath": "src/main.ts",
    "destinationParentRelativePath": "archive"
  }
}
```

The source must be non-root and the destination parent must be an existing
directory in the active workspace. Native code preserves the source leaf name,
rejects an existing destination, and refuses to move a directory into itself or
one of its descendants. Every source, destination, and ancestor is opened
handle-relative without following links or reparse points. No absolute source,
external file, destination name, or overwrite option is accepted. Success
returns the moved entry. The UI sends this method only for an internal tree drag;
external operating-system file drops are ignored.

Delete one existing non-root entry:

```json
{
  "id": "req-48",
  "token": "per-launch-random-capability",
  "method": "explorer.entry.delete",
  "params": { "relativePath": "src/obsolete" }
}
```

Files are removed directly. A directory may be non-empty, but native code first
enforces fixed depth and entry-count ceilings and then walks it only through
retained no-follow directory capabilities. Reparse points are never traversed
and the ambient recursive-delete API is not used. Success returns
`{ "deleted": true }`. The UI item is labeled **Delete** and asks for
confirmation when activated; that dialog is a UX safeguard, not native
authentication of a physical click.

Deletion preflights the complete bounded subtree before removing anything. A
concurrent same-user filesystem change during its second pass can still cause a
partial deletion inside the retained workspace; it cannot redirect traversal
through a reparse point or outside the retained root.

Reveal one validated existing entry:

```json
{
  "id": "req-49",
  "token": "per-launch-random-capability",
  "method": "explorer.entry.reveal",
  "params": { "relativePath": "src/main.rs" }
}
```

Native code validates the retained root, every no-follow ancestor, and the final
existing entry before invoking a fixed `explorer.exe /select, PATH` operation.
The renderer cannot select a program or arguments, and the absolute path is
never returned across the bridge. Success returns `{ "revealed": true }`.

Create, rename, move, and delete linearize with context clear/switch under the native
active-context lock. Every operation revalidates retained root identity; watcher
notifications and an eager UI refresh reconcile the affected loaded directory.

## Stable error codes

`INVALID_REQUEST`, `UNAUTHORIZED`, `NO_CONTEXT`, `INVALID_PATH`,
`OUTSIDE_WORKSPACE`, `NOT_FOUND`, `ACCESS_DENIED`, `TOO_MANY_ENTRIES`,
`CONTENT_TOO_LARGE`, `CONFLICT`, `NOT_EDITABLE`, `RATE_LIMITED`, `CANCELLED`,
`UNSUPPORTED_VERSION`, and `INTERNAL`.

`CANCELLED` means the request belonged to a renderer document or workspace
generation that has already been revoked. `TIMEOUT` is a renderer-client error
created locally when no native response arrives within the bounded request
window; it is not emitted by the native bridge.

Preview classification failures use the successful `kind: "unsupported"`
result above. Filesystem and lifecycle failures continue to use the existing
`INVALID_PATH`, `OUTSIDE_WORKSPACE`, `NOT_FOUND`, `ACCESS_DENIED`, and
`CANCELLED` codes and never include the requested path or file contents.
`CONTENT_TOO_LARGE` rejects decoded or final content over 64 KiB; `CONFLICT`
means preview bytes no longer match `expectedVersion` or a create/rename
destination already exists; `NOT_EDITABLE` covers a file or replacement that
fails the fixed save policy.
