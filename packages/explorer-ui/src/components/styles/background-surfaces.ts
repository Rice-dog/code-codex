/** Host-owned transparency for rendered backgrounds. Legacy effects share the
 * Particle/Glow markers; local media uses Custom. Add a new source marker here,
 * never copy a per-plugin selector list into each shadow-root consumer.
 * Native window transparency keeps its separate, mask-free presentation rules. */
export const BACKGROUND_SURFACE_ATTRIBUTES = [
  'data-code-codex-particle-image-background',
  'data-code-codex-glow-horizon-background',
  'data-code-codex-custom-background',
] as const;
export const BACKGROUND_SURFACE_CONTEXT = `:host-context(html:is(${BACKGROUND_SURFACE_ATTRIBUTES.map(name=>`[${name}]`).join(',')}))`;

export const backgroundPreviewSurfaceStyles = String.raw`
  /* The Codex main surface already supplies the background plugins' .58
   * conversation mask. Clear the preview's own opaque layers so opening a
   * file does not stack a second mask over the effect. Keep PDF pages, slides,
   * images, and editor controls themselves legible. */
  ${BACKGROUND_SURFACE_CONTEXT} :is(
    .preview-panel,
    .preview-meta-bar,
    .preview-content,
    .code-minimap,
    .code-vertical-scrollbar,
    .code-line-numbers,
    .code-editor-stack,
    .code-editor-highlight,
    .code-editor,
    .editor-error,
    .markdown-reader,
    .markdown-truncated,
    .csv-preview,
    .csv-table-scroll,
    .diagram-preview,
    .diagram-canvas,
    .notebook-preview,
    .model-preview,
    .model-preview-toolbar,
    .model-preview-stage,
    .media-preview[data-kind="pdf"],
    .pdf-preview-toolbar,
    .pdf-page-stage,
    .office-preview,
    .office-preview-notice,
    .office-sheet-tabs,
    .office-sheet-viewport,
    .office-preview-toolbar,
    .office-slide-viewport,
    .rpv-root,
    .rpv-stage,
    .rpv-viewport,
    .rpv-status
  ) {
    background-color: transparent !important;
    -webkit-backdrop-filter: none !important;
    backdrop-filter: none !important;
  }

  ${BACKGROUND_SURFACE_CONTEXT} .model-preview-stage {
    background-image: none !important;
  }

`;

export const backgroundTreeSurfaceStyles = String.raw`
  ${BACKGROUND_SURFACE_CONTEXT} .frame {
    background-color: rgba(16, 17, 20, .68) !important;
    -webkit-backdrop-filter: none !important;
    backdrop-filter: none !important;
  }

  ${BACKGROUND_SURFACE_CONTEXT} :is(
    .tree-shell,
    .file-search-toolbar
  ) {
    background-color: transparent !important;
    -webkit-backdrop-filter: none !important;
    backdrop-filter: none !important;
  }

  ${BACKGROUND_SURFACE_CONTEXT} :is(
    .masthead,
    .statusbar
  ) {
    background-color: rgba(24, 25, 28, .78) !important;
    -webkit-backdrop-filter: none !important;
    backdrop-filter: none !important;
  }

  ${BACKGROUND_SURFACE_CONTEXT} .file-filter {
    background-color: rgba(30, 31, 35, .86) !important;
    -webkit-backdrop-filter: none !important;
    backdrop-filter: none !important;
  }

  ${BACKGROUND_SURFACE_CONTEXT} :is(
    .loading-chip,
    .context-menu,
    .context-dialog-input,
    .action-notice,
    .state-action,
    .preview-market-popover,
    .preview-extension
  ),
  ${BACKGROUND_SURFACE_CONTEXT} .preview-market-popover::after {
    background-color: var(--cle-paper-raised) !important;
    -webkit-backdrop-filter: none !important;
    backdrop-filter: none !important;
  }

  ${BACKGROUND_SURFACE_CONTEXT} .collapsed-tab {
    background: var(--code-codex-particle-ui-surface, rgba(11, 12, 15, .58)) !important;
    border-color: transparent;
    border-right: 0;
    -webkit-backdrop-filter: none !important;
    backdrop-filter: none !important;
  }

`;
