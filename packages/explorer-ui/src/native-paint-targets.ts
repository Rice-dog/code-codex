import { MAIN_SURFACE_SELECTOR, SPLIT_MAIN_FRAME_SELECTOR, SPLIT_MAIN_VIEW_SELECTOR } from './adapters/codex-26.715';
import { NATIVE_SETTINGS_BACKING, NATIVE_SETTINGS_MAIN, NATIVE_SETTINGS_PAGE, NATIVE_SETTINGS_PANEL } from './native-background-surfaces';
import { NATIVE_TURN_CHANGE_HEADER } from './native-workspace-background';
import { NATIVE_TURN_CHANGE_CARD } from './native-paint-markers';

/** Qualify native paint targets at the existing mount boundary. Giving the
 * rules their own attributes keeps popup/focus mutations out of descendant
 * relationship matching in the global styles. */
export class NativePaintTargets {
  #targets = new Map<string, Set<Element>>();

  constructor(private readonly document: Document) {}

  update(): void {
    const settings = new Set<Element>();
    for (const panel of this.document.querySelectorAll(`${NATIVE_SETTINGS_PANEL},${NATIVE_SETTINGS_PAGE}`)) {
      const main = panel.closest(NATIVE_SETTINGS_MAIN);
      if (main) settings.add(main);
    }
    this.#mark(NATIVE_SETTINGS_BACKING, settings);

    const cards = new Set<Element>();
    for (const header of this.document.querySelectorAll(`${MAIN_SURFACE_SELECTOR} ${NATIVE_TURN_CHANGE_HEADER}`)) {
      if (header.parentElement?.matches('div')) cards.add(header.parentElement);
    }
    this.#mark(NATIVE_TURN_CHANGE_CARD, cards);

    const frames = new Set(this.document.querySelectorAll(
      `${MAIN_SURFACE_SELECTOR} ${SPLIT_MAIN_VIEW_SELECTOR} > ${SPLIT_MAIN_FRAME_SELECTOR}`,
    ));
    this.#mark('data-code-codex-native-split-frame', frames);
  }

  clear(): void {
    for (const [attribute, elements] of this.#targets) {
      for (const element of elements) element.removeAttribute(attribute);
    }
    this.#targets.clear();
  }

  #mark(attribute: string, elements: Set<Element>): void {
    for (const previous of this.#targets.get(attribute) ?? []) {
      if (!elements.has(previous)) previous.removeAttribute(attribute);
    }
    for (const element of elements) {
      if (!element.hasAttribute(attribute)) element.setAttribute(attribute, '');
    }
    this.#targets.set(attribute, elements);
  }
}
