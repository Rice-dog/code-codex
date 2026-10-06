import { populateGlowHorizonLayer, BlackHoleRenderer, GlowHorizonRenderer, HeavenlyCloudRenderer, AuroraIonosphereRenderer, MilkyWayRenderer, MountainRenderer, CloudTrainRenderer, readBlackHoleBackgroundSettings, readGlowHorizonBackgroundSettings, readHeavenlyCloudBackgroundSettings, readAuroraIonosphereBackgroundSettings, readMilkyWayBackgroundSettings, readMountainBackgroundSettings, readCloudTrainBackgroundSettings, readBlinkingSquaresBackgroundSettings } from './startup-background-renderers';
import { mountParticleImageStartupBackground } from './particle-image-startup';
import { mountPixelSculptStartupBackground } from './pixel-sculpt-renderer';
import { BlinkingSquaresRenderer } from './blinking-squares-host';

export const STARTUP_BACKGROUNDS = [
  ['glow-horizon','Glow Horizon Background'], ['black-hole','Black Hole Background'],
  ['heavenly-cloud','Heavenly Cloud Background'], ['aurora-ionosphere','Aurora Ionosphere Background'],
  ['milky-way','Milky Way Background'], ['mountain','Layered Mountain Background'],
  ['cloud-train','Cloud Train Background'], ['blinking-squares','Blinking Squares Background'],
  ['particle-image','Particle Image Background'], ['pixel-sculpt','Pixel Sculpt Background'],
] as const;
export interface StartupBackgroundRenderer { dispose():void; readonly ready?:Promise<void>; }
export function mountStartupBackground(target: HTMLElement, id: string, onError: (message?: string)=>void): StartupBackgroundRenderer {
  const canvas=document.createElement('canvas');canvas.style.cssText='width:100%;height:100%;display:block';target.append(canvas);
  switch(id) {
    case 'glow-horizon':{canvas.remove();const settings=readGlowHorizonBackgroundSettings();populateGlowHorizonLayer(target,settings);return new GlowHorizonRenderer(target,settings);}
    case 'black-hole':return new BlackHoleRenderer(target,canvas,{...readBlackHoleBackgroundSettings(),paused:false},onError);
    case 'heavenly-cloud':return new HeavenlyCloudRenderer(target,canvas,{...readHeavenlyCloudBackgroundSettings(),paused:false},onError);
    case 'aurora-ionosphere':return new AuroraIonosphereRenderer(target,canvas,{...readAuroraIonosphereBackgroundSettings(),paused:false},onError);
    case 'milky-way':return new MilkyWayRenderer(target,canvas,{...readMilkyWayBackgroundSettings(),paused:false},onError);
    case 'mountain':return new MountainRenderer(target,canvas,{...readMountainBackgroundSettings(),paused:false},onError);
    case 'cloud-train':return new CloudTrainRenderer(target,canvas,{...readCloudTrainBackgroundSettings(),paused:false},onError);
    case 'blinking-squares':canvas.remove();return new BlinkingSquaresRenderer(target,{...readBlinkingSquaresBackgroundSettings(),paused:false},onError);
    case 'particle-image':canvas.remove();return mountParticleImageStartupBackground(target,onError);
    case 'pixel-sculpt':return mountPixelSculptStartupBackground(target,canvas,onError);
    default:canvas.remove();throw Error('Unsupported startup background');
  }
}
