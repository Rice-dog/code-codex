# Shallow Ocean Letters Background / 浅海来信

Native procedural ocean background for Code-Codex. Source: the user-provided `shallow ocean2` project. Public prompt reference: Ocean Shallows by @Vib3Coded. The user regenerated, debugged and extended the implementation with AI tools; no original author source or assets were used. The standalone source is preserved unchanged; source-provenance.json records its hashes.

## Ownership

- `source/`: source ecosystem, water, event and opening algorithms, scoped entry wrappers; main.js exposes bounded scene actions without the standalone page shortcuts.
- `scene.js`: private DOM/window/storage, visibility/resize/reduced-motion, first-frame readiness and owned RAF/timers/audio/GPU cleanup. No iframe, CDN, external fonts or host globals.
- `renderer.ts`: global-language opening title and passive trusted pointer routing excluding Codex controls. Independent normal/startup instances.
- `src/effects/shallow-ocean/options.ts`: defaults/ranges and normalization, 28 numeric values including `performanceMode` and the hidden `defaultCreaturesEnabled` population flag. Missing performance mode defaults to Auto(0), and the population flag to1 for older settings. A single global reset restores every scalar, including hidden values and performance mode. The obsolete saved `eventFrequency` is ignored.
- `src/plugin-host/backgrounds/shallow-ocean.ts`: settings persistence and scene commands; shared managed.ts owns activation, theme lease and generation checks.
- `src/features/plugin-settings/shallow-ocean.ts`: horizontal dock beside Preview Market with all ten model cards in one non-wrapping row, twelve visible controls across six groups. One global reset and a separate clear-all-marine-life action sit above the gallery. Replay belongs to Opening. Rain UI/action/shortcut, geometry and audio channel are removed; the storm encounter remains.
- `src/effects/shallow-ocean/thumbnails.json`: ten transparent192x136 PNGs generated once from the original dock model renderer by `scripts/generate-ocean-thumbnails.mjs`. The runtime never performs a hidden thumbnail GPU pass or downloads images.
- `event-schedule.js`: fixed180second visible active clock. At each available boundary,50% no event; otherwise80% common (school/dolphin/storm, uniform thirds) or20% rare (meteor/duo, uniform halves). Existing event animations are preserved; the old shuffle and meteor cooldown are removed.

Settings key: `code-codex:shallow-ocean-background:v1`. Runtime creature positions and temporary sound state are not a saved-world format. Fish-count actions update persistent count settings; individual ray/jelly additions last for the current instance. Opening defaults to enabled, 5.2 seconds, strength 1, and restores the original framing at completion. Editing or reopening settings does not recreate the scene.

Three.js r128 is bundled under the exact `three-ocean-r128` npm alias, keeping the host's existing Three version unchanged. MIT license included in the plugin notices. Hidden/offscreen rendering and audio pause; reduced motion holds a static frame. First frame resolves ready; failure before 30 seconds or WebGL context loss produces an English diagnostic. Context loss disposes this instance and permits explicit retry. Disposal releases all owned resources, not the removed Three.Scene.dispose API.

The cadence pauses while automatic events are disabled or rendering is hidden/offscreen/reduced-motion; it is independent of animation frame-rate, water speed and the previous event's duration. A busy boundary is skipped without interrupting or queueing another event. A long frame creates at most one draw. Manual preview can replace the current event but never resets the cadence. Read-only `stats.events` includes remaining seconds, check/skip counts, last selection and the active event. Before filtering, per available three-minute decision either rare event has probability5%. After collection, a selected tier with no included events is skipped without rerolling another tier.

## Performance modes

The compact header exposes a localized Performance selector: `performanceMode` is numeric0(Auto, default),1(Low quality),2(Medium quality),3(High quality). It applies immediately and saves with existing settings; it does not recreate the canvas, replay the opening, change resident creature counts or erase discoveries. Selection while disabled is used on next activation. The global reset restores Auto along with the other scalar defaults.

| Profile | Frame ceiling | Maximum DPR | Maximum drawing pixels | Creature shadows | Particle scale | Next migration fish |
|---|---:|---:|---:|---:|---:|---:|
| Low quality |60|0.85|1280×720|16|0.35|360|
| Medium quality |60|1.1|1920×1080|32|0.65|720|
| High quality |60|1.6|2560×1440|64|1|1440|

`performance.js` owns these background budgets. These are ceilings, not guaranteed FPS or GPU utilization. Auto starts Medium quality, samples four seconds of rendered frames, lowers after two sustained slow samples and raises after three stable samples with a cooldown. Hidden time, intentional frame skips and deltas above250ms do not count as load samples. Each profile change has a30second upgrade cooldown; initial settling is20seconds. Every quality tier retains a60FPS target, including Auto downshifts; only resolution and visual detail budgets change. The elapsed-time frame gate prevents120/144Hz displays multiplying scene updates. Actual throughput remains hardware/load-dependent. Drawing resolution does not affect UI text.

Water integration remains60Hz to preserve its propagation and damping. Event decisions retain their separate visible elapsed clock and probabilities. Particle and shadow budgets update live; migration density applies to the next migration so an active school is not truncated. Resident/user-added creatures are not deleted. Coral/seagrass live texture rebakes wait120ms after the final input; the existing committed source-page rebake remains140ms and is separate from the host live-input path.

Read-only diagnostics expose configured mode, effective profile, target/observed FPS, pixel ceiling, actual drawing dimensions, particle/shadow/migration budgets and actual migration population. No GPU-model classification or per-frame persistence is used. Concurrent Codex work, first shader compilation and hardware can still affect responsiveness.

## Validation and distribution

Run `node scripts/test-ocean-performance.mjs`, `node scripts/test-ocean-event-schedule.mjs`, `node scripts/test-shallow-ocean.mjs`, `node scripts/test-shallow-ocean-ui.mjs` and `node scripts/test-managed-background.mjs` from the repository root after the normal locked UI build. These distinguish deterministic policy/probability/time fixtures, native WebGL, mocked host boundaries and actual installed host acceptance. Public distribution requires the exact independently versioned JS resource to be published; local exact-hash import does not imply public availability.

## Encounter collection and horizontal dock

Natural events are surprises: the user interface reveals no timing, odds, tiers or undiscovered names. The main renderer calls a scoped start hook only after a scheduled event starts; diagnostic previews and startup copies never collect. A bounded host journal (`code-codex:shallow-ocean-events:v1`) persists discovered/excluded known IDs. Previously encountered events appear disabled until all five have been discovered. Then each button toggles inclusion with aria-pressed highlighting; it never immediately triggers an event. All-off is supported. Resetting parameters does not erase discoveries. The journal uses the existing native preference backup.

The dock starts8px to the right of the visible Preview Market, capped at1120px within its available space. Maximum height is min(280px,28vh,100vh−24px); excess controls scroll internally. Redundant category/species headings and instructions are removed. Narrow windows first use available space above/below the market, with bounded overlay as a last fallback when side-by-side geometry is impossible. Species stay in one horizontal scroll row on narrow screens. Common controls use responsive3/2/1columns. Click/keyboard animate a temporary image from the card to the sea in650ms before adding; drag uses the release position. Reduced motion adds immediately. Closing/disposal cancels outstanding flights, with no delayed creature addition. The live scene/canvas is reused. Ordinary parameter edits preserve hidden legacy values; the explicit global reset restores them to defaults.

Additional checks: `node scripts/test-ocean-event-journal.mjs`; real native rendering tests accelerate the production frame clock only inside an isolated fixture to verify natural-start hooks and all-off filtering. Those fixtures do not unlock a user's real collection.

## Reset and clear population

Global reset removes added residents and the current encounter, restores every default scalar and repopulates exactly4 rays,5 jellies,72 silver fish,12 reef fish,6 clownfish,2 sharks and2 turtles. Repeated resets do not duplicate animals. Clear-all cancels the active encounter, clears every resident and stores zero counts plus defaultCreaturesEnabled=0; other parameters, discoveries and inclusion filters remain intact. Re-enabling/reloading a cleared scene does not reseed default rays/jellies. New manual additions and natural encounters remain possible. Reset restores defaultCreaturesEnabled=1. Both commands cancel pending gallery flights and guard late microtask commits. While disabled they save the desired settings without enabling the background; pending activation disables both buttons. Event migration cleanup uses stopSchoolMigrationEvent rather than obsolete streamEvent.fish. Scene/canvas ownership is unchanged.

## Atomic presentation and black-frame diagnosis

Viewport resize and manual/automatic quality changes queue pending drawing-buffer changes. They commit immediately before a full scene render in the same callback, never after a presented frame. Unchanged dimensions/DPR avoid rebuilding the buffer. Paused scenes retain the last painted frame until resume, without recreating the canvas or scene. An isolated native WebGL reproduction confirmed the old immediate-quality-resize path could present100% black; fixed-path screenshots cover paused and automatic transitions. This identifies a reproducible mechanism, not every possible GPU/compositor black-screen cause.

Read-only presentation diagnostics include resizeRequests, bufferResizes, redundantResizes, qualityChanges, pendingResize/pendingResizeReason and lastResize (reason, old/new pixels/DPR, frame), lastFrameMs/maxFrameMs (frame intervals, not GPU render duration) and longFrames above50ms. No per-frame logging or pixel readback is introduced. Real context loss retains the existing English failure/teardown lifecycle. Additional pixel regression: node scripts/test-ocean-presentation.mjs.
