/** Shared card-anchored top-layer geometry. No observer or timer. */
export function positionPluginPanel(panel:HTMLElement,trigger:HTMLElement,preferredWidth=344):void {
 if(!panel.matches(':popover-open'))return;
 const card=trigger.closest('article')!.getBoundingClientRect(),edge=12,gap=8,width=Math.min(preferredWidth,innerWidth-edge*2);
 panel.style.width=`${width}px`;panel.style.maxHeight=`${innerHeight-edge*2}px`;
 const left=card.right+gap+width<=innerWidth-edge?card.right+gap:Math.max(edge,innerWidth-edge-width);
 panel.dataset.side=left===card.right+gap?'right':'overlay';panel.style.left=`${Math.round(left)}px`;
 panel.style.top=`${Math.round(Math.max(edge,Math.min(card.top,innerHeight-edge-Math.min(panel.scrollHeight,innerHeight-edge*2))))}px`;
}
