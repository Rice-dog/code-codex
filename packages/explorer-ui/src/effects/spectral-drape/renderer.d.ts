import type {SpectralDrapeSettings} from './model';
export class SpectralDrapeRenderer {constructor(host:HTMLElement,canvas:HTMLCanvasElement,settings:SpectralDrapeSettings,onError?:(message?:string)=>void);setSettings(settings:SpectralDrapeSettings):void;replay():void;dispose():void;}
