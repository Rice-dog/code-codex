let publish:(event:string,value:unknown)=>void=()=>{};
export function connectKernelEvents(next:typeof publish){publish=next;}
export function kernelEvent(event:string,value:unknown){publish(event,value);}
