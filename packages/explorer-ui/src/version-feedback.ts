/** One transient result, deferred until the footer can actually be seen. */
export class VersionFeedback {
  #pending: { kind: "update" | "latest" | "error"; version?: string } | undefined;
  #phase = "";
  #timer: ReturnType<typeof setTimeout> | undefined;
  #eligible = false;
  #observer: IntersectionObserver | undefined;
  constructor(private readonly button: HTMLButtonElement, private readonly render: () => void) {}

  connect(): void {
    this.#observer?.disconnect();
    this.#observer = new IntersectionObserver(() => this.sync());
    this.#observer.observe(this.button);
    document.addEventListener("visibilitychange", this.#visibility);
  }
  readonly #visibility = (): void => this.sync();
  get text(): string | undefined {
    if (this.#phase && this.#pending?.kind === "update") return `↑ v${this.#pending.version}`;
    return undefined;
  }
  show(kind: "update" | "latest" | "error", version?: string): void {
    this.cancel();
    this.#pending = { kind, ...(version === undefined ? {} : { version }) };
    this.sync();
  }
  sync(eligible = this.#eligible): void {
    this.#eligible = eligible;
    const rect = this.button.getBoundingClientRect();
    const startup = (window as unknown as Record<symbol, { phase?: string }>)[Symbol.for("code-codex:startup-transition:controller:v1")];
    const onScreen = rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.right > 0
      && rect.top < innerHeight && rect.left < innerWidth && getComputedStyle(this.button).visibility !== "hidden";
    const visible = eligible && this.button.isConnected && document.visibilityState === "visible"
      && onScreen && (!startup || startup.phase === "complete");
    if (!visible && this.#phase) {
      this.#clearTimer();
      this.#phase = "";
      delete this.button.dataset.feedback;
      delete this.button.dataset.feedbackPhase;
      this.render();
    }
    if (!visible || this.#phase || !this.#pending) {
      // The splash can cover an otherwise measurable footer. Only a pending
      // result polls it; normal operation has no periodic UI work.
      if (!visible && eligible && onScreen && startup?.phase !== "complete" && startup
        && this.#pending && this.#timer === undefined && document.visibilityState === "visible") {
        this.#timer = setTimeout(() => { this.#timer = undefined; this.sync(); }, 200);
      }
      return;
    }
    this.#clearTimer();
    this.#phase = "in";
    this.button.dataset.feedback = this.#pending.kind;
    this.button.dataset.feedbackPhase = "in";
    this.render();
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (this.#pending.kind === "update") {
      this.#timer = setTimeout(() => {
        this.#phase = "hold";
        this.button.dataset.feedbackPhase = "hold";
        this.#timer = setTimeout(() => {
          this.#phase = "out";
          this.button.dataset.feedbackPhase = "out";
          this.#timer = setTimeout(() => this.cancel(), reduced ? 0 : 250);
        }, 1500);
      }, reduced ? 0 : 250);
    } else {
      this.#timer = setTimeout(() => this.cancel(), 1000);
    }
  }
  #clearTimer(): void { if (this.#timer !== undefined) clearTimeout(this.#timer); this.#timer = undefined; }
  cancel(): void {
    this.#clearTimer();
    this.#pending = undefined;
    this.#phase = "";
    delete this.button.dataset.feedback;
    delete this.button.dataset.feedbackPhase;
    this.render();
  }
  dispose(): void {
    this.#observer?.disconnect(); this.#observer = undefined;
    document.removeEventListener("visibilitychange", this.#visibility);
    this.cancel();
  }
}
