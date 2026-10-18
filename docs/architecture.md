# Maintenance and extension guide

The application composition wires capabilities together. Feature controllers own their state and behavior. Workspace IO uses the request-only WorkspaceBridge contract; authentication, subscription and bridge disposal stay in application assembly. Core services own shared policies with a single purpose. A feature must not import an application element, modify another feature's fields, or pass an entire application/controller as a substitute for a small capability contract.

## Ownership

| Responsibility | Source owner | Collaboration |
| --- | --- | --- |
| Host mounting, official UI events and application assembly | `packages/explorer-ui/src/app/explorer-element.ts` | Wires read-only observations and bound named commands |
| Defaults, limits and stable IDs | `src/core/configuration/explorer.ts` | Compatibility export in `app/explorer-configuration.ts`; consumers use the core owner |
| Qualified renderer workspace identity | `src/core/session/workspace-session.ts` | Read-only session observations; check identity after asynchronous work |
| Tree model, filtering, selection, keyboard, marquee and visible rows | `src/features/workspace/tree-interaction.ts` | Directory loader and file actions consume explicit tree capabilities |
| Context menus, clipboard actions and filesystem mutations | `src/features/workspace/file-actions.ts` | `features/file-operations/mutation-gate.ts` serializes menu and drop writers |
| External drag/drop, upload transaction and reconciliation | `src/features/workspace/external-drop.ts` | Uses the same mutation lease; late workspace results cannot commit |
| Preview tabs, scheduling, media release and Git diff previews | `src/features/workspace/preview-workspace.ts` | Main preview view is a capability contract, not a concrete application class |
| Drafts, save verification, edit conflicts and recovery | `src/features/workspace/preview-editing.ts` | Own draft store; named preview/view and lifecycle commands |
| Update candidate, feedback, dialog and install handoff | `src/features/workspace/updates.ts` | Startup media does not own update policy |
| Background exclusion, prepare, activation, commit and rollback | `src/core/appearance/background-actions.ts` | Registered runtime capabilities; settings do not enumerate siblings |
| Native window background | `src/host/native-surfaces/native-window-background.ts` | Qualified native request adapter; native acceptance precedes media exclusion |
| Plugin panel exclusion | `src/core/lifecycle/panel-coordinator.ts` | Close-by-owner callbacks; no sibling controller objects |
| Per-plugin settings and media | `src/features/plugin-settings/`, `plugins/appearance/custom-background/` | Own state, shared markup/styles and host appearance commands |
| Native protocol, authorization and process lifecycle | `crates/cdp-client/`, `crates/launcher/src/bridge/`, launcher platform/app modules | Existing API1/RPC/authentication, path and size budgets remain authoritative |
| Plugin distribution | `resources/plugin-definitions.json`, `resources/plugin-distribution.lock.json` | Application version never supplies an unchanged plugin's URL |
| Install/remove workers | `installer/src/` and `scripts/generate-installer.mjs` | Edit templates, generate standalone workers, verify protocol and storage boundaries |

Paths beginning with `src/` in this table are relative to `packages/explorer-ui/`. Composition may still coordinate related lifecycle events; it must not acquire feature-specific draft, selection or candidate state.

## Adding a background

1. Define its independent package identity and runtime exports; reuse existing card/settings/media structures.
2. Implement its own renderer/runtime and settings controller. The settings port contains a public capability for its own runtime (a small interface or `Pick` of actually used public members), `BackgroundCommands`, read-only UI observations and named view commands. A fake runtime must not need the implementation's private fields. It never references other background runtime classes or IDs.
3. Register the runtime once in the application's background registry. The coordinator handles exclusion and rollback for all registered entries. Register its settings close callback in the panel registry.
   Reuse `src/components/styles/background-surfaces.ts` for host-owned preview/tree backings. Existing effects share Particle/Glow markers; local media uses the Custom marker. A genuinely new marker is declared once there, rather than copied into each consumer. Keep native window transparency separate. Reuse the existing native Settings helper, preserve document paper and controls, and run `node scripts/test-background-surfaces.mjs` plus real-host file-opening checks. Surface Opacity must paint each region's alpha once.
4. Audit actual source inputs and resulting package bytes. Use the explicit rebuild flow only for changed packages; changed bytes require a new independent identity. Preserve existing resource tags and verified caches.
5. Run architecture/isolation checks and real-browser transitions, including preparation failure, native refusal, partial activation, cancellation, late completion and rollback. Check that the current media/preferences survive a failed switch.

Overlay tools such as Surface Opacity and Startup Transition do not enter the mutually exclusive background registry. A new registration must not require editing existing sibling settings controllers.

## Adding a preview or workspace feature

Register a format in the existing preview package definition and use the preview capability/normalized view contracts. Tab allocation, eviction, revision checks and media release belong to PreviewWorkspaceController. A Git/history feature requests a preview; it does not append to the tab store directly. Draft ownership stays in PreviewEditingController.

New filesystem writers acquire a MutationAccess lease and release it in `finally`. Do not add a second global busy boolean. Capture the workspace identity before IO, check it after awaits, and never replay a write after reconnect. Clipboard clearing must compare the captured clipboard object so an old completion cannot clear a newer selection.

## Executable boundaries

```powershell
npm --prefix packages/explorer-ui run typecheck
node scripts/check-architecture.mjs
node --test scripts/test-maintenance-isolation.mjs scripts/test-file-mutation-isolation.mjs scripts/test-refactor-contracts.mjs
npm --prefix packages/explorer-ui run build
```

Architecture checks reject runtime cycles, lower-layer imports from `app`, sibling settings implementations/runtimes, writable or untyped host fields, feature behavior routed back through the host, and unbound callable capability getters. Negative fixtures demonstrate those rejections. A capability getter that returns a method must bind its receiver; a named arrow command is also valid.

These checks complement browser and native tests. They do not certify visual behavior, every platform, a real account switch, destructive uninstall or public asset availability. Preserve first failures and distinguish fixture, real-host, package, installed and public-download evidence.

## Changes that should remain small

Keep mature parsing/rendering algorithms, CDP qualification and bounded queues, native path capabilities, HTTP/TLS policy, media transactions, worker protocols and Keep/Purge storage semantics unless the feature actually requires changing them. Refactoring an unrelated UI feature is not a reason to alter those policies.

Errors and technical diagnostics are English; ordinary UI follows the global language. Keep stable failure codes, stages and recovery boundaries. Cancellation and observed errors are not automatically new root failures.

Packaging must verify actual independent asset identities, package contents and PE versions. Installation success does not prove live activation; check the visible owner and usable tree/Bridge. Missing public dependencies keep the package a local candidate. Publication remains a separate operation.
