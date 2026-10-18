import { icons } from '../icons';

export interface AppearanceCardDefinition {
  id: string;
  className: string;
  title: string;
  /** Trusted, application-owned SVG markup. Never pass imported media or user text. */
  icon: string;
  statusId: string;
  settingsClass: string;
  settingsId: string;
}
const text=(value: string): string => value.replace(/[&<>"']/g,character => ({ '&': '&amp;','<': '&lt;','>': '&gt;','"': '&quot;',"'": '&#39;' }[character]!));

/** Shared DOM, action semantics and accessibility for background cards. */
export function appearanceCardMarkup(card: AppearanceCardDefinition): string {
  const title=text(card.title),status=text(card.statusId);
  return `
    <article class="preview-extension appearance-extension ${text(card.className)}" data-appearance-plugin="${text(card.id)}" aria-busy="false">
      <span class="preview-extension-icon" aria-hidden="true">${card.icon}</span>
      <div class="preview-extension-copy">
        <div class="preview-extension-title-row">
          <h4>${title}</h4>
          <span class="preview-extension-status" id="${status}">Disabled</span>
        </div>
      </div>
      <div class="preview-extension-actions">
        <button class="preview-extension-action" type="button" aria-describedby="${status}" aria-pressed="false">Enable</button>
        <button class="${text(card.settingsClass)}" type="button" title="Configure ${title}" aria-label="Configure ${title}" aria-haspopup="dialog" aria-controls="${text(card.settingsId)}" aria-expanded="false">${icons.sliders}</button>
      </div>
    </article>
  `;
}
