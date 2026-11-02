export const EVENT_INTERVAL_SECONDS=180;
export const COMMON_EVENTS=Object.freeze(['school','dolphin','storm']);
export const RARE_EVENTS=Object.freeze(['meteor','duo']);

/** Active visible time; disabled/hidden scenes do not build a catch-up queue. */
export function createEventSchedule(random=Math.random){
 let remaining=EVENT_INTERVAL_SECONDS,checks=0,skipped=0,last=null;
 return {
  advance(seconds,enabled,busy=false,included=[...COMMON_EVENTS,...RARE_EVENTS]){
   if(!enabled||!Number.isFinite(seconds)||seconds<=0)return null;
   remaining-=seconds;if(remaining>1e-9)return null;
   if(Math.abs(remaining)<1e-9)remaining=0;
   remaining=EVENT_INTERVAL_SECONDS-((-remaining)%EVENT_INTERVAL_SECONDS);
   // A long frame may cross several boundaries. Never replay a burst of events.
   if(busy){skipped++;return null;}
   checks++;
   if(random()>=.5){last={tier:null,event:null};return null;}
   const common=random()<.8,pool=(common?COMMON_EVENTS:RARE_EVENTS).filter(id=>included.includes(id));
   if(!pool.length){last={tier:common?'common':'rare',event:null};return null;}
   const event=pool[Math.floor(random()*pool.length)];
   last={tier:common?'common':'rare',event};return event;
  },
  snapshot:()=>({intervalSeconds:EVENT_INTERVAL_SECONDS,remainingSeconds:remaining,checks,skipped,last})
 };
}
