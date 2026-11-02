import type {OceanOptions} from '../../../src/effects/shallow-ocean/options';
export interface OceanScene {
 ready:Promise<void>;disposed:boolean;canvas:HTMLCanvasElement;
 api:{addCreature(kind:string,u?:number,v?:number):void;action(action:string):void;previewEvent(kind:string):unknown;cancelEvent():void};
 setParameters(settings:OceanOptions):void;setPaused(value:boolean):void;replay():void;dispose():void;snapshot():unknown;
}
export interface OceanEventHooks {included():string[];started(id:string):void}
export function createScene(target:HTMLElement,canvas:HTMLCanvasElement,settings:OceanOptions,onError:(message:string)=>void,onSettings?:(settings:OceanOptions)=>void,eventHooks?:OceanEventHooks):OceanScene;
