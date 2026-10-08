import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import BlinkingSquares, { type BlinkingSquaresProps } from "./blinking-squares";

export { BLINKING_SQUARES_DEFAULTS } from './blinking-squares-settings';
import { BLINKING_SQUARES_DEFAULTS, type BlinkingSquaresSettings } from './blinking-squares-settings';
export type { BlinkingSquaresSettings } from './blinking-squares-settings';
export class BlinkingSquaresRenderer {
  readonly #root: Root;
  readonly #onError: (message?: string) => void;
  #settings: BlinkingSquaresSettings;
  #replayKey = 0;
  #openingReset: (() => void) | undefined;
  readonly #onOpeningReady = (replay: (() => void) | undefined): void => { this.#openingReset = replay; };

  constructor(layer: HTMLElement, settings: BlinkingSquaresSettings, onError: (message?: string) => void) {
    this.#root = createRoot(layer);
    this.#settings = settings;
    this.#onError = onError;
    this.#render();
  }

  setSettings(settings: BlinkingSquaresSettings): void {
    this.#settings = settings;
    this.#render();
  }

  resumeOpening(): void { this.#openingReset?.(); }

  replay(): void {
    this.#replayKey += 1;
    this.#render();
  }

  dispose(): void { this.#root.unmount(); }

  #render(): void {
    this.#root.render(createElement(BlinkingSquares, {
      ...this.#settings,
      width: "100%",
      height: "100%",
      introKey: this.#replayKey,
      onOpeningReady: this.#onOpeningReady,
      onError: this.#onError,
    }));
  }
}
