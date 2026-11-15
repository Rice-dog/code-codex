// Shared read-only paint inspection. Targets are supplied by each surface contract.
export function unexpectedPaint(nodes:Iterable<Element>):string[]{
 const painted:string[]=[];
 for(const node of new Set(nodes))for(const pseudo of [null,'::before','::after']){
  const s=getComputedStyle(node,pseudo);
  if(s.display==='none'||s.visibility==='hidden'||Number(s.opacity)===0||(pseudo&&(s.content==='none'||s.content==='normal')))continue;
  const transparent=s.backgroundColor==='transparent'||/rgba\([^)]*,\s*0(?:\.0+)?\)$/.test(s.backgroundColor)||/\/\s*0(?:\.0+)?\s*\)$/.test(s.backgroundColor);
  if(s.backgroundImage!=='none'||!transparent)painted.push(`${node.tagName.toLowerCase()}${pseudo??''}: ${s.backgroundColor}; ${s.backgroundImage}`);
 }
 return painted;
}
