/** Long-press sorting for existing cards. Owns only temporary DOM/transforms. */
export class HoldReorder {
 #abort=new AbortController();
 #timer?:ReturnType<typeof setTimeout>;
 #frame=0;
 #springs=new Map<HTMLElement,{y:number;velocity:number}>();
 #drag:{row:HTMLElement;pointer:number;x:number;y:number;lastX:number;lastY:number;order:string[];ghost?:HTMLElement;top:number;left:number;scroll:HTMLElement;lastTime:number;velocity:number}|undefined;
 #pending=false;
 #suppress=false;
 constructor(private list:HTMLElement,private enabled:()=>boolean,private persist:(ids:string[])=>Promise<void>,private announce:(saved:boolean)=>void){
  const options={signal:this.#abort.signal};
  const panel=list.closest<HTMLElement>('[popover]');
  panel?.addEventListener('beforetoggle',event=>{if((event as ToggleEvent).newState==='closed')this.#clear();},options);
  list.addEventListener('pointerdown',e=>this.#down(e),options);
  list.addEventListener('click',e=>{if(this.#suppress){e.preventDefault();e.stopImmediatePropagation();this.#suppress=false;}},{...options,capture:true});
  window.addEventListener('pointermove',e=>this.#move(e),{...options,passive:false});
  window.addEventListener('pointerup',e=>{if(e.pointerId===this.#drag?.pointer)void this.#end(true);},options);
  window.addEventListener('pointercancel',()=>void this.#end(false),options);
  window.addEventListener('blur',()=>void this.#end(false),options);
  window.addEventListener('keydown',e=>{if(e.key==='Escape'&&this.#drag){e.preventDefault();e.stopImmediatePropagation();void this.#end(false);}},{...options,capture:true});
  list.addEventListener('lostpointercapture',()=>{if(this.#drag)void this.#end(false);},options);
  list.addEventListener('keydown',e=>{
   if(e.key==='Escape'&&this.#drag){e.preventDefault();e.stopPropagation();void this.#end(false);return;}
   const row=(e.target as Element).closest<HTMLElement>('.accounts-connection');
   if(!row||e.target!==row||row.dataset.host==='true'||!e.altKey||!['ArrowUp','ArrowDown'].includes(e.key)||!this.enabled()||this.#pending)return;
   e.preventDefault();const ids=this.#ids(),at=ids.indexOf(row.dataset.connection!),next=at+(e.key==='ArrowUp'?-1:1);if(next<0||next>=ids.length)return;
   const order=[...ids];[order[at],order[next]]=[order[next]!,order[at]!];this.#layout(order);void this.#save(order,ids);
  },options);
 }
 #rows():HTMLElement[]{return [...this.list.querySelectorAll<HTMLElement>(':scope > .accounts-connection[data-host="false"]:not([data-reorder-ghost])')];}
 #ids():string[]{return this.#rows().map(e=>e.dataset.connection!);}
 #textAt(row:HTMLElement,x:number,y:number):boolean{
  // Grid/ellipsis containers fill unused card space. Reject the rendered text,
  // rather than the whole container, so its genuinely blank area remains usable.
  const walker=document.createTreeWalker(row,NodeFilter.SHOW_TEXT),range=document.createRange();
  let text:Node|null,count=0;
  while((text=walker.nextNode())&&count++<128){
   if(!text.textContent?.trim())continue;
   const parent=text.parentElement;if(!parent)continue;
   const clip=parent.getBoundingClientRect();
   if(x<clip.left||x>clip.right||y<clip.top||y>clip.bottom)continue;
   range.selectNodeContents(text);
   for(const rect of range.getClientRects())if(x>=rect.left&&x<=rect.right&&y>=rect.top&&y<=rect.bottom)return true;
  }
  // Unknown, unexpectedly large markup is not admitted as empty space.
  return count>128;
 }
 #down(e:PointerEvent):void{
  if(e.button!==0||!e.isPrimary||!this.enabled()||this.#pending||this.#drag)return;
  const target=e.target as Element,row=target.closest<HTMLElement>('.accounts-connection[data-host="false"]:not([data-reorder-ghost])');
  if(!row||target.closest('button,a,input,select,textarea,[contenteditable]:not([contenteditable=false]),[role=button],.accounts-avatar,.accounts-login-dot')||this.#textAt(row,e.clientX,e.clientY))return;
  e.preventDefault();
  let scroll=this.list.parentElement!;while(scroll.parentElement&&scroll.scrollHeight<=scroll.clientHeight)scroll=scroll.parentElement;
  this.#drag={row,pointer:e.pointerId,x:e.clientX,y:e.clientY,lastX:e.clientX,lastY:e.clientY,order:this.#ids(),top:0,left:0,scroll,lastTime:performance.now(),velocity:0};
  row.dataset.hold='true';this.#timer=setTimeout(()=>this.#lift(),420);
 }
 #lift():void{
  const d=this.#drag;if(!d||!this.enabled()||!d.row.isConnected){this.cancel();return;}
  const r=d.row.getBoundingClientRect();d.top=r.top;d.left=r.left;const ghost=d.row.cloneNode(true)as HTMLElement;
  ghost.dataset.reorderGhost='true';ghost.removeAttribute('tabindex');ghost.setAttribute('aria-hidden','true');ghost.inert=true;ghost.setAttribute('popover','manual');
  // Native top layer keeps viewport coordinates correct under transformed hosts.
  Object.assign(ghost.style,{position:'fixed',inset:'auto',margin:'0',left:r.left+'px',top:r.top+'px',width:r.width+'px',height:r.height+'px',zIndex:'1000',pointerEvents:'none'});
  d.ghost=ghost;this.list.append(ghost);ghost.showPopover();d.row.dataset.dragging='true';this.list.dataset.reordering='true';
  this.list.setPointerCapture(d.pointer);this.#suppress=true;this.#tick();
 }
 #move(e:PointerEvent):void{
  const d=this.#drag;if(!d||e.pointerId!==d.pointer)return;
  if(!d.ghost){if(Math.hypot(e.clientX-d.x,e.clientY-d.y)>7)this.cancel();return;}
  e.preventDefault();const now=performance.now();d.velocity=(e.clientY-d.lastY)/Math.max(.01,(now-d.lastTime)/1000);d.lastTime=now;d.lastX=e.clientX;d.lastY=e.clientY;
  this.#position();
 }
 #position():void{
  const d=this.#drag;if(!d?.ghost)return;
  d.ghost.style.transform=`translate3d(${d.lastX-d.x}px,${d.lastY-d.y}px,0) scale(${this.#reduced()?1:1.018})`;
  const rows=this.#rows().filter(r=>r!==d.row),center=d.top+d.ghost.offsetHeight/2+d.lastY-d.y;
  const before=rows.find(r=>{const rect=r.getBoundingClientRect();return center<rect.top+rect.height/2;});
  const ids=rows.map(r=>r.dataset.connection!);ids.splice(before?ids.indexOf(before.dataset.connection!):ids.length,0,d.row.dataset.connection!);
  if(ids.join()!==this.#ids().join())this.#layout(ids);
 }
 #layout(ids:string[]):void{
  const rows=this.#rows(),old=new Map(rows.map(r=>[r,r.getBoundingClientRect().top]));
  for(const row of rows)row.style.transform='';
  const end=this.list.querySelector('.accounts-add-tile');for(const id of ids){const row=rows.find(r=>r.dataset.connection===id);if(row)this.list.insertBefore(row,end);}
  for(const row of rows){const y=old.get(row)!-row.getBoundingClientRect().top;if(row!==this.#drag?.row&&!this.#reduced()&&Math.abs(y)>.1){const prior=this.#springs.get(row);this.#springs.set(row,{y,velocity:prior?.velocity??0});row.style.transform=`translateY(${y}px)`;}else this.#springs.delete(row);}
  this.#tick();
 }
 sync(ids:string[]):void{if(!this.#drag&&!this.#pending&&ids.join()!==this.#ids().join())this.#layout(ids);}
 #reduced():boolean{return matchMedia('(prefers-reduced-motion: reduce)').matches;}
 #tick():void{
  if(this.#frame)return;let last=performance.now();const frame=(now:number)=>{
   this.#frame=0;const dt=Math.min((now-last)/1000,.032);last=now;
   for(const[row,s]of this.#springs){s.velocity+=(-420*s.y-41*s.velocity)*dt;s.y+=s.velocity*dt;if(!row.isConnected||Math.abs(s.y)<.12&&Math.abs(s.velocity)<.4||this.#reduced()){row.style.transform='';this.#springs.delete(row);}else row.style.transform=`translateY(${s.y}px)`;}
   const d=this.#drag;if(d?.ghost){const r=d.scroll.getBoundingClientRect(),edge=38;const speed=d.lastY<r.top+edge?-Math.min(360,(r.top+edge-d.lastY)*10):d.lastY>r.bottom-edge?Math.min(360,(d.lastY-r.bottom+edge)*10):0;if(speed){d.scroll.scrollTop+=speed*dt;this.#position();}}
   if(this.#springs.size||this.#drag?.ghost)this.#frame=requestAnimationFrame(frame);
  };this.#frame=requestAnimationFrame(frame);
 }
 async #save(ids:string[],original:string[]):Promise<void>{
  if(ids.join()===original.join())return;this.#pending=true;
  try{await this.persist(ids);this.announce(true);}catch{if(this.#ids().slice().sort().join()===original.slice().sort().join())this.#layout(original);this.announce(false);}finally{this.#pending=false;}
 }
 async #end(commit:boolean):Promise<void>{
  clearTimeout(this.#timer);const d=this.#drag;if(!d)return;this.#drag=undefined;
  const ids=this.#ids();delete d.row.dataset.hold;delete d.row.dataset.dragging;delete this.list.dataset.reordering;
  if(this.list.hasPointerCapture(d.pointer))this.list.releasePointerCapture(d.pointer);
  if(!d.ghost)return;
  // Settle the lifted card toward the exact new slot, from its presentation value.
  const ghost=d.ghost;d.row.dataset.settling='true';if(!commit)this.#layout(d.order);
  const target=d.row.getBoundingClientRect(),rect=ghost.getBoundingClientRect();
  if(!this.#reduced()){
   const start=performance.now(),x=rect.left-target.left,y=rect.top-target.top,v=Math.max(-1800,Math.min(1800,d.velocity));
   const settle=(now:number)=>{const time=(now-start)/1000,decay=Math.exp(-22*time);ghost.style.left=target.left+'px';ghost.style.top=target.top+'px';ghost.style.transform=`translate(${(x+22*x*time)*decay}px,${(y+(v+22*y)*time)*decay}px) scale(${1+.018*decay})`;if(time<.3&&ghost.isConnected)requestAnimationFrame(settle);else{ghost.remove();delete d.row.dataset.settling;}};requestAnimationFrame(settle);
  }else{ghost.remove();delete d.row.dataset.settling;}
  setTimeout(()=>{this.#suppress=false;},0);if(commit)await this.#save(ids,d.order);
 }
 cancel():void{void this.#end(false);}
 #clear():void{this.cancel();cancelAnimationFrame(this.#frame);this.#frame=0;for(const row of this.#springs.keys())row.style.transform='';this.#springs.clear();for(const ghost of this.list.querySelectorAll('[data-reorder-ghost]'))ghost.remove();}
 dispose():void{this.#clear();this.#abort.abort();}
}
