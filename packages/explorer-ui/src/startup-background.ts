import { cachedStartupBackground } from './background-plugin-runtime';
export const STARTUP_BACKGROUNDS = [
  ['glow-horizon','Glow Horizon Background'], ['black-hole','Black Hole Background'],
  ['heavenly-cloud','Heavenly Cloud Background'], ['aurora-ionosphere','Aurora Ionosphere Background'],
  ['milky-way','Milky Way Background'], ['mountain','Layered Mountain Background'],
  ['cloud-train','Cloud Train Background'], ['blinking-squares','Blinking Squares Background'],
  ['particle-image','Particle Image Background'], ['pixel-sculpt','Pixel Sculpt Background'],
] as const;
export interface StartupBackgroundRenderer { dispose():void; readonly ready?:Promise<void>; }
export function mountStartupBackground(target: HTMLElement, id: string, onError: (message?: string)=>void): StartupBackgroundRenderer {return cachedStartupBackground(id,target,onError);}
