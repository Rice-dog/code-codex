export interface PreviewClockPorts {
  active(): boolean;
  background(): HTMLVideoElement|HTMLImageElement|undefined;
  preview(): HTMLVideoElement|HTMLImageElement|undefined;
  play(video: HTMLVideoElement): void;
  pause(video: HTMLVideoElement): void;
  failed(error: unknown): void;
}
/** The active background is authoritative; this object may seek only its preview. */
export class PreviewClockFollower {
  #timer: number|undefined;
  #aligning=false;
  constructor(private readonly ports: PreviewClockPorts) { }
  get running(): boolean { return this.#timer!==undefined; }
  stop(): void {
    if(this.#timer!==undefined) window.clearInterval(this.#timer);
    this.#timer=undefined; this.#aligning=false;
    const preview=this.ports.preview();
    if(preview) preview.style.visibility='';
  }
  start(): void {
    this.stop();
    const preview=this.ports.preview(),background=this.ports.background();
    if(!this.ports.active()||!(preview instanceof HTMLVideoElement)) return;
    if(!(background instanceof HTMLVideoElement)) { this.ports.play(preview); return; }
    this.#aligning=true;
    if(preview.readyState<2) preview.style.visibility='hidden';
    this.#timer=window.setInterval(() => this.align(),80);
    this.align();
  }
  align(): void {
    const background=this.ports.background(),preview=this.ports.preview();
    if(!this.ports.active()||!(background instanceof HTMLVideoElement)||!(preview instanceof HTMLVideoElement)) { this.stop(); return; }
    if(background.readyState<1||preview.readyState<1||background.seeking||preview.seeking) return;
    preview.playbackRate=background.playbackRate;
    try {
      if(Math.abs(preview.currentTime-background.currentTime)>.08) preview.currentTime=background.currentTime;
      else if(this.#aligning) { this.#aligning=false; preview.style.visibility=''; }
      if(background.paused) this.ports.pause(preview); else this.ports.play(preview);
    } catch(error) { this.stop(); this.ports.failed(error); }
  }
}
