import {backgroundConstructor} from '../../background-plugin-runtime';
import type {ShallowOceanRenderer as Renderer} from '../../../plugins/appearance/shallow-ocean/renderer';
import {ManagedBackgroundController} from './managed';
import {DEFAULT_OPTIONS,ID,KEY,normalize,readSettings,type OceanOptions} from '../../effects/shallow-ocean/model';
import {recordCaughtRuntimeError} from '../../runtime-operations';
import {OceanEventJournal} from '../../effects/shallow-ocean/event-journal';
const ShallowOceanRenderer=backgroundConstructor<typeof import('../../../plugins/appearance/shallow-ocean/renderer').ShallowOceanRenderer>('shallow-ocean','ShallowOceanRenderer');
export class ShallowOceanBackgroundController extends ManagedBackgroundController<OceanOptions,Renderer>{
 #populationGeneration=0;#populationQueue:Promise<void>=Promise.resolve();
 readonly #journal:OceanEventJournal;
 readonly #development:{enabled:boolean};
 readonly #developmentListeners=new Set<()=>void>();
 constructor(){const journal=new OceanEventJournal(),development={enabled:false};super({id:ID,packageId:'shallow-ocean',label:'Shallow Ocean Letters Background',layerAttribute:'data-code-codex-shallow-ocean-layer',canvasClass:'code-codex-particle-canvas code-codex-shallow-ocean-canvas',defaults:DEFAULT_OPTIONS,read:readSettings,normalize,persist:settings=>{try{localStorage.setItem(KEY,JSON.stringify(settings))}catch(error){recordCaughtRuntimeError('Shallow Ocean settings write',error)}},color:()=>'#181818',disposeOnRendererError:true,deferPresentationUntilReady:true,create:(...args)=>new ShallowOceanRenderer(args[0],args[1],development.enabled?{...args[2],eventsEnabled:0}:args[2],args[3],true,{included:()=>journal.included,started:id=>{if(development.enabled)return;try{journal.discover(id)}catch(error){recordCaughtRuntimeError('Ocean automatic event discovery',error)}}})});this.#journal=journal;this.#development=development;}
 get developerMode(){return this.#development.enabled;}
 setDeveloperMode(enabled:boolean):void{
  if(this.#development.enabled===enabled)return;
  this.#development.enabled=enabled;
  this.#applyEffectiveSettings();
  for(const listener of this.#developmentListeners)listener();
 }
 #applyEffectiveSettings(){this.renderer?.setSettings(this.developerMode?{...this.settings,eventsEnabled:0}:this.settings);}
 override updateSettings(next:OceanOptions):void{super.updateSettings(next);this.#applyEffectiveSettings();}
 override async disable(preserveTheme=false):Promise<void>{this.#populationGeneration++;this.setDeveloperMode(false);await super.disable(preserveTheme);}
 override dispose():void{this.#populationGeneration++;this.#development.enabled=false;this.#developmentListeners.clear();super.dispose();}
 get eventJournal(){return this.#journal.state;}
 toggleEvent(id:string){this.#journal.toggle(id);}
 override subscribe(listener:()=>void){const a=super.subscribe(listener),b=this.#journal.subscribe(listener);this.#developmentListeners.add(listener);return ()=>{a();b();this.#developmentListeners.delete(listener);};}
 private requireRenderer(){if(!this.enabled||!this.renderer)throw Error('Enable Shallow Ocean Letters Background before using scene controls.');return this.renderer;}
 addCreature(kind:string,u=.5,v=.5):Promise<void>{const generation=this.#populationGeneration;const operation=this.#populationQueue.catch(()=>{}).then(async()=>{if(generation!==this.#populationGeneration)return;const renderer=this.requireRenderer();await renderer.addCreature(kind,u,v);if(generation!==this.#populationGeneration||renderer!==this.renderer)return;const state=renderer.diagnostics as {parameters:OceanOptions}|null;if(state){const {silverCount,reefCount,clownCount,sharkCount,turtleCount,defaultCreaturesEnabled}=state.parameters;this.updateSettings({...this.settings,silverCount,reefCount,clownCount,sharkCount,turtleCount,defaultCreaturesEnabled});}});this.#populationQueue=operation;return operation;}
 resetAll():void{this.#populationGeneration++;this.updateSettings({...DEFAULT_OPTIONS});this.renderer?.action('reset-population');}
 clearCreatures():void{this.#populationGeneration++;
  this.renderer?.action('clear');
  this.updateSettings({...this.settings,defaultCreaturesEnabled:0,silverCount:0,reefCount:0,clownCount:0,sharkCount:0,turtleCount:0});
 }
 previewEvent(kind:string){this.requireRenderer().previewEvent(kind)}
 action(action:string){this.requireRenderer().action(action)}
}
const SLOT=Symbol.for('code-codex:shallow-ocean-controller:v1');
export function getShallowOceanBackgroundController():ShallowOceanBackgroundController{
 const host=window as unknown as Record<symbol,unknown>,old=host[SLOT];
 if(old instanceof ShallowOceanBackgroundController)return old;
 if(old&&typeof old==='object'&&'dispose' in old&&typeof old.dispose==='function')old.dispose();
 return host[SLOT]=new ShallowOceanBackgroundController();
}
