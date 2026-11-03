/** Market-only artwork. Kept outside downloadable renderers and their input closures. */
const glyphs = {
  'signal-hands': '<path d="m1 10 3-3 3 1M15 5l-3 3-3-1M1 13l2-2m10-8 2-2"/><circle cx="8" cy="7.5" r=".65"/>',
  'multi-account':'<circle cx="5" cy="4.5" r="2"/><circle cx="11.5" cy="5.5" r="1.5"/><path d="M1.5 13v-1.5a3.5 3.5 0 0 1 7 0V13m2-4a3 3 0 0 1 4 3v1M6 13h5m-1.5-1.5L11 13l-1.5 1.5"/>',
  'custom-background': '<rect x="2" y="2.5" width="12" height="11" rx="2"/><circle cx="5.5" cy="6" r="1"/><path d="m3 12 3.5-3.5 2 2L11 8l2 2.5"/>',
  'shallow-ocean': '<path d="M1.5 5.5c2-3 4 3 6 0s4 3 6 0M1.5 10.5c2-3 4 3 6 0s4 3 6 0M8 2v1M12 12.5v1.5"/>',
  'ascii-tiles': '<path d="m3 2 5 1-1 5-5-1zM9 3l5 1-1 5-5-1zM2 9l5 1-1 4-5-1zM8 10l5 1-1 3-5-1zM4.5 4l-1 2M4 5.5h1.5"/>',
  'surface-opacity': '<rect x="2" y="2" width="8" height="8" rx="1.5"/><rect x="6" y="6" width="8" height="8" rx="1.5"/><path d="m7 9 2-2m-2 5 5-5m-2 6 3-3"/>',
  'transparent-background': '<rect x="2" y="2" width="12" height="12" rx="2"/><path d="M6 2v12M10 2v12M2 6h12M2 10h12m-9-5 6 6m0-6-6 6"/>',
  'particle-image': '<circle cx="3" cy="3" r=".65"/><circle cx="7" cy="2.5" r=".65"/><circle cx="2.5" cy="7" r=".65"/><circle cx="6.5" cy="6" r=".65"/><path d="M10 3h3v10H3v-3m1.5 1 3-3 2 2 2-3 1.5 2"/>',
  'black-hole': '<circle cx="8" cy="8" r="2.5"/><ellipse cx="8" cy="8" rx="6.5" ry="3" transform="rotate(-25 8 8)"/><path d="M5 3a6 6 0 0 1 8 4M3 9a6 6 0 0 0 8 4"/>',
  'glow-horizon': '<path d="M2 10h12M3 13h10M5 10a3 3 0 0 1 6 0M8 2v2M3 4l1.5 1.5M13 4l-1.5 1.5M1.5 7h2M12.5 7h2"/>',
  'heavenly-cloud': '<path d="M4 12a3 3 0 1 1 .5-6 4 4 0 0 1 7.7 1A2.5 2.5 0 0 1 12 12zM5 14h6"/>',
  'aurora-ionosphere': '<path d="M2 12c2-14 3 2 5-8s3 14 5 1l2-3M2 14c2-9 3 1 5-4s3 7 5 0l2-4"/>',
  'milky-way': '<path d="M2 12C3 5 9 1 13 3c4 3-4 10-8 9-3-1 0-5 4-6 3-1 2 2 0 3M3 2v2M2 3h2M12 12v2M11 13h2"/>',
  'mountain': '<path d="m1.5 13 5-10 5 10zm6-6 3-3 4 9h-3M4.5 7l2 1.5L8 7M2 14.5h12"/>',
  'cloud-train': '<rect x="5" y="6" width="8" height="6" rx="1.5"/><path d="M7 6V4H4a1.5 1.5 0 1 1 1-2M6 9h6M9 6v3M3 14h11"/><circle cx="7" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/>',
  'pixel-sculpt': '<path d="M2 14V8h3V5h3V2h3v4h3v8zM2 11h12M5 8v6M8 5v9M11 6v8"/>',
  'blinking-squares': '<rect x="2" y="2" width="4" height="4" rx=".5"/><rect x="9" y="3" width="3" height="3" rx=".5"/><rect x="3" y="10" width="3" height="3" rx=".5"/><rect x="9" y="9" width="5" height="5" rx=".5"/>',
  'codex-startup-transition': '<path d="M2 3v10M4.5 4v8M7 2h6a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H7zM9 5.5 12 8l-3 2.5z"/>',
  'git-history': '<circle cx="4" cy="3" r="1.5"/><circle cx="4" cy="13" r="1.5"/><circle cx="12" cy="8" r="1.5"/><path d="M4 4.5v7M5.5 5.25C8 5.25 9 8 10.5 8"/>',
  'markdown-preview': '<rect x="1.5" y="3" width="13" height="10" rx="1.5"/><path d="M3.5 10V6l2 2 2-2v4M11 6v4m-1.5-1.5L11 10l1.5-1.5"/>',
  'csv-preview': '<rect x="2" y="2" width="12" height="12" rx="1.5"/><path d="M2 6h12M2 10h12M6 2v12M10 2v12"/>',
  'diagram-preview': '<rect x="6" y="1.5" width="4" height="3" rx=".5"/><rect x="1.5" y="11" width="5" height="3.5" rx=".5"/><rect x="9.5" y="11" width="5" height="3.5" rx=".5"/><path d="M8 4.5v3H4V11m4-3.5h4V11"/>',
  'image-preview': '<rect x="2" y="3" width="12" height="10" rx="1.5"/><circle cx="5" cy="6" r="1"/><path d="m2 11 4-3 3 3 2-2 3 3"/>',
  'video-preview': '<rect x="2" y="2" width="12" height="12" rx="1.5"/><path d="M5 2v12M11 2v12M2 6h3m-3 4h3m6-4h3m-3 4h3M7 6l2.5 2L7 10z"/>',
  'pdf-preview': '<path d="M3 1.5h7l3 3v10H3zM10 1.5v3h3M5 12c3-4 3-7 2-6-2 2 1 6 4 5 2-1-5-2-6 1z"/>',
  'audio-preview': '<path d="M2 7v2M5 4v8M8 2v12M11 5v6M14 7v2"/>',
  'office-preview': '<path d="M3 1.5h7l3 3v10H3zM10 1.5v3h3M5 7h6M5 9h6M5 11h3"/><path d="M10 11v1.5m-1-1h2"/>',
  'notebook-preview': '<rect x="3" y="2" width="11" height="12" rx="1.5"/><path d="M6 2v12M1.5 5h3M1.5 8h3M1.5 11h3m6-6-2 2 2 2m1-4-1 5"/>',
  'model-preview': '<path d="m8 1.5 6 3.25v6.5L8 14.5l-6-3.25v-6.5zM8 8l6-3.25M8 8 2 4.75M8 8v6.5"/>',
} as const;

export type PluginIconId = keyof typeof glyphs;
export const pluginIconIds = Object.freeze(Object.keys(glyphs) as PluginIconId[]);

export function pluginIconMarkup(id: PluginIconId): string {
  return `<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">${glyphs[id]}</svg>`;
}

// Runtime card IDs predate the independent distribution IDs. Keep aliases explicit.
const aliases: Readonly<Record<string, PluginIconId>> = {
  'layered-mountain-background': 'mountain',
  'startup-transition': 'codex-startup-transition',
  ...Object.fromEntries(pluginIconIds.map(id => [id, id])),
  ...Object.fromEntries(pluginIconIds.filter(id => !id.endsWith('-preview')).map(id => [`${id}-background`, id])),
};

/** Run synchronously after the market template is assembled, before it is displayed. */
export function applyPluginCardIcons(root: ShadowRoot): void {
  for (const card of root.querySelectorAll<HTMLElement>('.preview-extension')) {
    const raw = card.dataset.toolPlugin ?? card.dataset.appearancePlugin ?? card.dataset.previewExtension
      ?? (card.classList.contains('git-history-extension') ? 'git-history' : '');
    const id = aliases[raw.replace(/^code-codex\./, '')];
    const slot = card.querySelector<HTMLElement>('.preview-extension-icon');
    if (!id || !slot) continue; // Unknown external cards keep their supplied artwork.
    slot.dataset.pluginIcon = id;
    slot.innerHTML = pluginIconMarkup(id);
  }
}
