export class LiquidAsciiRenderer {
 constructor(host:HTMLElement,canvas:HTMLCanvasElement,settings?:unknown,onError?:(message:string)=>void,onFrame?:()=>void);
 setSettings(settings:unknown):void;
 replay():void;
 dispose():void;
}
