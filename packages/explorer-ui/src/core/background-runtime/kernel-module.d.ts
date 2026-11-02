declare module 'code-codex:background-kernel' {
 export function createKernel(host:HTMLElement,canvas:HTMLCanvasElement,settings:unknown,onError:(message:unknown)=>void):any;
 export const kernelMethods:readonly string[];
}
