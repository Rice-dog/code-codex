import type { BackgroundCommands } from "../../contracts/appearance";
import type { ParticleBackgroundController } from '../../plugin-host/backgrounds/controllers';
// Feature-owned parameter state and behavior. Composition supplies explicit host ports only.
import { BackgroundPackageMarket } from "../../background-package-market";
import { backgroundSettingsError,particleEditorNumber,particleEditorScale,particleMorphCurvesMatch,particleOutputAriaLabel } from "../../components/parameter-format";
import { type BackgroundSettingsLanguage,type ParticleImageTransformControlDefinition,type ParticleMorphCurveDragState,type ParticleMorphCurveHandle,type ParticleNumericControlDefinition,type ParticleNumericSettingKey,type ParticleValueControl } from "../../contracts/explorer-model";
import { PARTICLE_BACKGROUND_PLUGIN_ID,PARTICLE_MORPH_CURVE_EDITOR_BOUNDS,PARTICLE_MORPH_CURVE_EDITOR_NODE_GAP,PARTICLE_MORPH_CURVE_SVG_NS } from "../../core/configuration/explorer";
import { icons } from "../../icons";
import {
DEFAULT_PARTICLE_IMAGE_TRANSFORM,
DEFAULT_PARTICLE_MORPH_CURVE,
MAX_PARTICLE_MORPH_CURVE_NODES,
clampParticleUnitInterval,
cloneParticleMorphCurve,
evaluateParticleMorphCurve,
normalizeParticleImageTransform,
normalizeParticleMorphCurve,
normalizeParticleSettings,
type ParticleImageTransform,
type ParticleMorphCurve
} from "../../particle-image-startup";
import { ensureBackgroundPackage } from "../../plugin-load-diagnostics";
export interface ParticleSettingsControllerPorts {
  readonly closeOtherSettings: () => void;
  readonly backgroundActions: BackgroundCommands;
  readonly particleBackgroundController: Pick<ParticleBackgroundController,"beginImageTransformEditing"|"deleteImage"|"enabled"|"error"|"finishImageTransformEditing"|"pending"|"previewImageTransform"|"records"|"refreshLibrary"|"settings"|"thumbnailUrl"|"toggleImageSelection"|"updateImageTransform"|"updateSettings">;
  readonly enabledAppearancePlugins: ReadonlySet<string>;
  readonly announce: (message: string) => void;
  readonly showActionNotice: (message: string,tone?: "success"|"error") => void;
  readonly particleMorphCurveEditor: SVGSVGElement;
  readonly backgroundText: (zh: string,en: string) => string;
  readonly particleMorphCurveNodes: SVGGElement;
  readonly particleMorphCurveStartHandle: SVGGElement;
  readonly particleMorphCurveEndHandle: SVGGElement;
  readonly backgroundSettingsLanguage: BackgroundSettingsLanguage;
  readonly particleNumericControls: Map<ParticleNumericSettingKey,Readonly<{ definition: ParticleNumericControlDefinition; input: HTMLInputElement; output: HTMLOutputElement; editor: HTMLInputElement; }>>;
  readonly particleImageTransformControls: Map<keyof ParticleImageTransform,Readonly<{ definition: ParticleImageTransformControlDefinition; input: HTMLInputElement; output: HTMLOutputElement; editor: HTMLInputElement; }>>;
  readonly particleIntroEnabledInput: HTMLInputElement;
  readonly particleAutoSwitchInput: HTMLInputElement;
  readonly particleShowSourceInput: HTMLInputElement;
  readonly particleBackgroundColorInput: HTMLInputElement;
  readonly particleCursorInteractionInput: HTMLInputElement;
  readonly particleLibraryGrid: HTMLElement;
  readonly backgroundPackageMarket: BackgroundPackageMarket|undefined;
  readonly particleBackgroundButton: HTMLButtonElement;
  readonly particleOpeningReplayButton: HTMLButtonElement;
  readonly particleImageTransformReset: HTMLButtonElement;
  readonly particleLibraryClear: HTMLButtonElement;
  readonly particleLibraryUpload: HTMLInputElement;
  readonly previewMarketOpen: boolean;
  readonly togglePreviewMarket: () => void;
  readonly particleSettingsTrigger: HTMLButtonElement;
  readonly particleSettingsPanel: HTMLElement;
  readonly particleSettingsCloseButton: HTMLButtonElement;
}
export class ParticleSettingsController {
  // State belongs to this feature; the application consumes it explicitly.
  particleSettingsOpen = false;
  particleMorphCurveDraft = cloneParticleMorphCurve(DEFAULT_PARTICLE_MORPH_CURVE);
  particleMorphCurveDragState: ParticleMorphCurveDragState | undefined;
  particleMorphCurveFocusSnapshot: ParticleMorphCurve | undefined;
  particleTransformImageId: string | null = null;

  constructor(private readonly host: ParticleSettingsControllerPorts) { }
  particleBackgroundCard!: HTMLElement;
  particleBackgroundStatus!: HTMLElement;
  particleMorphCurvePath!: SVGPathElement;
  particleMorphCurvePathGlow!: SVGPathElement;
  particleMorphCurveStartTangent!: SVGLineElement;
  particleMorphCurveEndTangent!: SVGLineElement;
  particleMorphCurveMode!: HTMLElement;
  particleMorphCurveReset!: HTMLButtonElement;
  particleMorphCurveNodeElements: SVGGElement[]=[];
  particleMorphCurveSelectedNodeIndex: number|null=null;
  particleSourceCount!: HTMLElement;
  particleImageTransformEditor!: HTMLElement;
  particleImageTransformThumb!: HTMLImageElement;
  particleImageTransformName!: HTMLElement;
  particlePluginError!: HTMLElement;
  async initializeParticleBackground(generation: number): Promise<void> { await this.host.backgroundActions.initialize(PARTICLE_BACKGROUND_PLUGIN_ID,generation); }
  async toggleParticleBackground(): Promise<void> { await this.host.backgroundActions.toggle(PARTICLE_BACKGROUND_PLUGIN_ID); }
  particleMorphCurvePoint(time: number,progress: number): { readonly x: number; readonly y: number } {
    const bounds=PARTICLE_MORPH_CURVE_EDITOR_BOUNDS;
    return {
      x: bounds.left+time*(bounds.right-bounds.left),
      y: bounds.bottom-progress*(bounds.bottom-bounds.top),
    };
  }
  particleMorphCurvePathFor(curve: ParticleMorphCurve): string {
    const start=this.particleMorphCurvePoint(0,0);
    const end=this.particleMorphCurvePoint(1,1);
    if(!curve.nodes.length) {
      const outgoing=this.particleMorphCurvePoint(curve.x1,curve.y1);
      const incoming=this.particleMorphCurvePoint(curve.x2,curve.y2);
      return `M ${start.x} ${start.y} C ${outgoing.x} ${outgoing.y} ${incoming.x} ${incoming.y} ${end.x} ${end.y}`;
    }
    let path="";
    for(let index=0;index<=96;index+=1) {
      const time=index/96;
      const point=this.particleMorphCurvePoint(
        time,
        evaluateParticleMorphCurve(time,curve).value,
      );
      path+=`${index===0? "M":"L"} ${point.x} ${point.y} `;
    }
    return path.trim();
  }
  updateParticleMorphCurveNodeSelection(): void {
    for(const element of this.particleMorphCurveNodeElements) {
      const selected=Number(element.dataset.nodeIndex)===this.particleMorphCurveSelectedNodeIndex;
      element.classList.toggle("is-selected",selected);
      element.setAttribute("aria-selected",String(selected));
    }
  }
  createParticleMorphCurveNodeElement(index: number): SVGGElement {
    const element=document.createElementNS(PARTICLE_MORPH_CURVE_SVG_NS,"g");
    element.classList.add("particle-morph-curve-node");
    element.dataset.nodeIndex=String(index);
    element.setAttribute("tabindex","0");
    element.setAttribute("role","slider");
    element.setAttribute("aria-valuemin","0");
    element.setAttribute("aria-valuemax","100");
    const hit=document.createElementNS(PARTICLE_MORPH_CURVE_SVG_NS,"circle");
    hit.classList.add("particle-morph-curve-node-hit");
    hit.setAttribute("r","12");
    const knob=document.createElementNS(PARTICLE_MORPH_CURVE_SVG_NS,"circle");
    knob.classList.add("particle-morph-curve-node-knob");
    knob.setAttribute("r","4.5");
    element.append(hit,knob);

    element.addEventListener("pointerdown",(event) => {
      if(event.button!==0||this.host.particleBackgroundController.pending) return;
      event.preventDefault();
      event.stopPropagation();
      const nodeIndex=Number(element.dataset.nodeIndex);
      if(!Number.isInteger(nodeIndex)||!this.particleMorphCurveDraft.nodes[nodeIndex]) return;
      this.particleMorphCurveSelectedNodeIndex=nodeIndex;
      this.updateParticleMorphCurveNodeSelection();
      element.focus({ preventScroll: true });
      this.particleMorphCurveDragState={
        pointerId: event.pointerId,
        kind: "node",
        nodeIndex,
        targetElement: element,
        originalCurve: cloneParticleMorphCurve(this.particleMorphCurveDraft),
      };
      this.host.particleMorphCurveEditor.setPointerCapture?.(event.pointerId);
      this.host.particleMorphCurveEditor.dataset.dragging="true";
    });
    element.addEventListener("focus",() => {
      this.particleMorphCurveSelectedNodeIndex=Number(element.dataset.nodeIndex);
      this.updateParticleMorphCurveNodeSelection();
      this.particleMorphCurveFocusSnapshot=cloneParticleMorphCurve(this.particleMorphCurveDraft);
    });
    element.addEventListener("blur",() => {
      if(!this.particleMorphCurveDragState) this.particleMorphCurveFocusSnapshot=undefined;
    });
    element.addEventListener("keydown",(event) => {
      if(this.host.particleBackgroundController.pending) return;
      const nodeIndex=Number(element.dataset.nodeIndex);
      if(event.key==="Delete"||event.key==="Backspace") {
        event.preventDefault();
        this.removeParticleMorphCurveNode(nodeIndex);
        return;
      }
      const step=event.shiftKey? 0.05:0.01;
      let timeDelta=0;
      let progressDelta=0;
      if(event.key==="ArrowLeft") timeDelta=-step;
      else if(event.key==="ArrowRight") timeDelta=step;
      else if(event.key==="ArrowDown") progressDelta=-step;
      else if(event.key==="ArrowUp") progressDelta=step;
      else return;
      event.preventDefault();
      const node=this.particleMorphCurveDraft.nodes[nodeIndex];
      if(!node) return;
      this.setParticleMorphCurveNode(nodeIndex,node.time+timeDelta,node.progress+progressDelta);
      this.saveParticleMorphCurve(this.host.backgroundText("变形关键帧已调整","Morph keyframe adjusted"));
    });
    return element;
  }
  renderParticleMorphCurveNodes(disabled: boolean): void {
    const nodes=this.particleMorphCurveDraft.nodes;
    if(this.particleMorphCurveNodeElements.length!==nodes.length) {
      const fragment=document.createDocumentFragment();
      this.particleMorphCurveNodeElements=nodes.map((_node,index) => {
        const element=this.createParticleMorphCurveNodeElement(index);
        fragment.append(element);
        return element;
      });
      this.host.particleMorphCurveNodes.replaceChildren(fragment);
    }
    nodes.forEach((node,index) => {
      const element=this.particleMorphCurveNodeElements[index];
      if(!element) return;
      const point=this.particleMorphCurvePoint(node.time,node.progress);
      const timePercent=Math.round(node.time*100);
      const progressPercent=Math.round(node.progress*100);
      element.setAttribute("transform",`translate(${point.x} ${point.y})`);
      element.setAttribute("tabindex",disabled? "-1":"0");
      element.setAttribute("aria-disabled",String(disabled));
      element.setAttribute("aria-valuenow",String(progressPercent));
      element.setAttribute(
        "aria-valuetext",
        this.host.backgroundText(
          `${progressPercent}% 变形进度，${timePercent}% 过渡时间`,
          `${progressPercent}% morph progress at ${timePercent}% transition time`,
        ),
      );
      element.setAttribute(
        "aria-label",
        this.host.backgroundText(
          `中间关键帧：${timePercent}% 时间，${progressPercent}% 变形进度`,
          `Intermediate keyframe ${timePercent}% time, ${progressPercent}% morph progress`,
        ),
      );
    });
    this.updateParticleMorphCurveNodeSelection();
  }
  renderParticleMorphCurveEditor(): void {
    const curve=this.particleMorphCurveDraft;
    const start=this.particleMorphCurvePoint(0,0);
    const end=this.particleMorphCurvePoint(1,1);
    const outgoing=this.particleMorphCurvePoint(curve.x1,curve.y1);
    const incoming=this.particleMorphCurvePoint(curve.x2,curve.y2);
    const path=this.particleMorphCurvePathFor(curve);
    this.particleMorphCurvePath.setAttribute("d",path);
    this.particleMorphCurvePathGlow.setAttribute("d",path);
    this.particleMorphCurveStartTangent.setAttribute("x1",String(start.x));
    this.particleMorphCurveStartTangent.setAttribute("y1",String(start.y));
    this.particleMorphCurveStartTangent.setAttribute("x2",String(outgoing.x));
    this.particleMorphCurveStartTangent.setAttribute("y2",String(outgoing.y));
    this.particleMorphCurveEndTangent.setAttribute("x1",String(end.x));
    this.particleMorphCurveEndTangent.setAttribute("y1",String(end.y));
    this.particleMorphCurveEndTangent.setAttribute("x2",String(incoming.x));
    this.particleMorphCurveEndTangent.setAttribute("y2",String(incoming.y));
    this.host.particleMorphCurveStartHandle.setAttribute("transform",`translate(${outgoing.x} ${outgoing.y})`);
    this.host.particleMorphCurveEndHandle.setAttribute("transform",`translate(${incoming.x} ${incoming.y})`);
    const disabled=this.host.particleBackgroundController.pending;
    this.host.particleMorphCurveEditor.dataset.disabled=String(disabled);
    this.host.particleMorphCurveEditor.setAttribute("aria-disabled",String(disabled));
    for(const [element,time,progress] of [
      [this.host.particleMorphCurveStartHandle,curve.x1,curve.y1],
      [this.host.particleMorphCurveEndHandle,curve.x2,curve.y2],
    ] as const) {
      const timePercent=Math.round(time*100);
      const progressPercent=Math.round(progress*100);
      element.setAttribute("tabindex",disabled? "-1":"0");
      element.setAttribute("aria-disabled",String(disabled));
      element.setAttribute("aria-valuenow",String(progressPercent));
      element.setAttribute(
        "aria-valuetext",
        this.host.backgroundText(
          `${progressPercent}% 变形进度，${timePercent}% 过渡时间`,
          `${progressPercent}% morph progress at ${timePercent}% transition time`,
        ),
      );
    }
    this.renderParticleMorphCurveNodes(disabled);
    const nodeCount=curve.nodes.length;
    const isDefault=particleMorphCurvesMatch(curve,DEFAULT_PARTICLE_MORPH_CURVE);
    const isLinear=Math.abs(curve.x1-curve.y1)<0.012
      &&Math.abs(curve.x2-curve.y2)<0.012;
    this.particleMorphCurveMode.textContent=isDefault
      ? this.host.backgroundText("平滑","Smooth")
      :nodeCount
        ? this.host.backgroundText(
          `${nodeCount} 个关键帧`,
          `${nodeCount} keyframe${nodeCount===1? "":"s"}`,
        )
        :isLinear
          ? this.host.backgroundText("线性","Linear")
          :this.host.backgroundText("自定义","Custom");
    this.particleMorphCurveReset.disabled=disabled||isDefault;
  }
  setParticleMorphCurveHandle(handle: ParticleMorphCurveHandle,time: number,progress: number): void {
    let nextTime=clampParticleUnitInterval(time);
    let nextProgress=clampParticleUnitInterval(progress);
    const curve=this.particleMorphCurveDraft;
    if(handle==="start") {
      nextTime=Math.min(nextTime,curve.x2);
      nextProgress=Math.min(nextProgress,curve.y2);
      this.particleMorphCurveDraft={
        ...curve,
        x1: Math.round(nextTime*1_000)/1_000,
        y1: Math.round(nextProgress*1_000)/1_000,
      };
    } else {
      nextTime=Math.max(nextTime,curve.x1);
      nextProgress=Math.max(nextProgress,curve.y1);
      this.particleMorphCurveDraft={
        ...curve,
        x2: Math.round(nextTime*1_000)/1_000,
        y2: Math.round(nextProgress*1_000)/1_000,
      };
    }
    this.renderParticleMorphCurveEditor();
  }
  setParticleMorphCurveNode(index: number,time: number,progress: number): void {
    const nodes=this.particleMorphCurveDraft.nodes;
    if(!nodes[index]) return;
    const previous=nodes[index-1];
    const next=nodes[index+1];
    const timeLower=previous?.time??0;
    const timeUpper=next?.time??1;
    const progressLower=previous?.progress??0;
    const progressUpper=next?.progress??1;
    const timeGap=Math.min(PARTICLE_MORPH_CURVE_EDITOR_NODE_GAP,Math.max(0,timeUpper-timeLower)/3);
    const progressGap=Math.min(PARTICLE_MORPH_CURVE_EDITOR_NODE_GAP,Math.max(0,progressUpper-progressLower)/3);
    const nextTime=Math.min(timeUpper-timeGap,Math.max(timeLower+timeGap,clampParticleUnitInterval(time)));
    const nextProgress=Math.min(progressUpper-progressGap,Math.max(progressLower+progressGap,clampParticleUnitInterval(progress)));
    this.particleMorphCurveDraft={
      ...this.particleMorphCurveDraft,
      nodes: nodes.map((node,nodeIndex) => nodeIndex===index
        ? {
          time: Math.round(nextTime*1_000)/1_000,
          progress: Math.round(nextProgress*1_000)/1_000,
        }
        :{ ...node }),
    };
    this.particleMorphCurveSelectedNodeIndex=index;
    this.renderParticleMorphCurveEditor();
  }
  addParticleMorphCurveNode(time: number,progress: number): void {
    const nodes=this.particleMorphCurveDraft.nodes;
    if(nodes.length>=MAX_PARTICLE_MORPH_CURVE_NODES) {
      this.host.showActionNotice(this.host.backgroundText(
        `变形曲线最多支持 ${MAX_PARTICLE_MORPH_CURVE_NODES} 个关键帧。`,
        `Morph curves support up to ${MAX_PARTICLE_MORPH_CURVE_NODES} keyframes.`,
      ),"error");
      return;
    }
    const insertionIndex=nodes.findIndex((node) => node.time>time);
    const index=insertionIndex<0? nodes.length:insertionIndex;
    const previous=nodes[index-1];
    const next=nodes[index];
    const timeLower=previous?.time??0;
    const timeUpper=next?.time??1;
    const progressLower=previous?.progress??0;
    const progressUpper=next?.progress??1;
    const timeGap=Math.min(PARTICLE_MORPH_CURVE_EDITOR_NODE_GAP,Math.max(0,timeUpper-timeLower)/3);
    const progressGap=Math.min(PARTICLE_MORPH_CURVE_EDITOR_NODE_GAP,Math.max(0,progressUpper-progressLower)/3);
    const candidate={
      time: Math.round(Math.min(timeUpper-timeGap,Math.max(timeLower+timeGap,clampParticleUnitInterval(time)))*1_000)/1_000,
      progress: Math.round(Math.min(progressUpper-progressGap,Math.max(progressLower+progressGap,clampParticleUnitInterval(progress)))*1_000)/1_000,
    };
    const nextNodes=[...nodes];
    nextNodes.splice(index,0,candidate);
    this.particleMorphCurveDraft=normalizeParticleMorphCurve({
      ...this.particleMorphCurveDraft,
      nodes: nextNodes,
    });
    this.particleMorphCurveSelectedNodeIndex=this.particleMorphCurveDraft.nodes.findIndex((node) => (
      Math.abs(node.time-candidate.time)<0.002
      &&Math.abs(node.progress-candidate.progress)<0.002
    ));
    this.renderParticleMorphCurveEditor();
    this.saveParticleMorphCurve(this.host.backgroundText("已添加变形关键帧","Morph keyframe added"));
  }
  removeParticleMorphCurveNode(index: number): void {
    const node=this.particleMorphCurveDraft.nodes[index];
    if(!node) return;
    this.particleMorphCurveDraft={
      ...this.particleMorphCurveDraft,
      nodes: this.particleMorphCurveDraft.nodes.filter((_candidate,nodeIndex) => nodeIndex!==index),
    };
    this.particleMorphCurveSelectedNodeIndex=null;
    this.renderParticleMorphCurveEditor();
    this.saveParticleMorphCurve(this.host.backgroundText(
      `已删除位于 ${Math.round(node.time*100)}% 的变形关键帧`,
      `Morph keyframe at ${Math.round(node.time*100)}% removed`,
    ));
  }
  particleMorphCurvePointerValue(event: PointerEvent|MouseEvent): { readonly time: number; readonly progress: number } {
    const rect=this.host.particleMorphCurveEditor.getBoundingClientRect();
    const bounds=PARTICLE_MORPH_CURVE_EDITOR_BOUNDS;
    const svgX=(event.clientX-rect.left)*bounds.width/Math.max(rect.width,1);
    const svgY=(event.clientY-rect.top)*bounds.height/Math.max(rect.height,1);
    return {
      time: (svgX-bounds.left)/(bounds.right-bounds.left),
      progress: (bounds.bottom-svgY)/(bounds.bottom-bounds.top),
    };
  }
  finishParticleMorphCurveDrag(event: PointerEvent,cancelled: boolean): void {
    const drag=this.particleMorphCurveDragState;
    if(!drag||event.pointerId!==drag.pointerId) return;
    if(this.host.particleMorphCurveEditor.hasPointerCapture?.(event.pointerId)) {
      this.host.particleMorphCurveEditor.releasePointerCapture?.(event.pointerId);
    }
    this.particleMorphCurveDragState=undefined;
    this.host.particleMorphCurveEditor.dataset.dragging="false";
    if(cancelled) this.particleMorphCurveDraft=cloneParticleMorphCurve(drag.originalCurve);
    this.renderParticleMorphCurveEditor();
    if(!cancelled) this.saveParticleMorphCurve(drag.kind==="node"
      ? this.host.backgroundText("变形关键帧已保存","Morph keyframe saved")
      :this.host.backgroundText("变形曲线已保存","Morph curve saved"));
  }
  cancelParticleMorphCurveInteraction(restoreDraft: boolean): void {
    const drag=this.particleMorphCurveDragState;
    if(drag) {
      if(this.host.particleMorphCurveEditor.hasPointerCapture?.(drag.pointerId)) {
        this.host.particleMorphCurveEditor.releasePointerCapture?.(drag.pointerId);
      }
      if(restoreDraft) this.particleMorphCurveDraft=cloneParticleMorphCurve(drag.originalCurve);
    } else if(restoreDraft) {
      this.particleMorphCurveDraft=cloneParticleMorphCurve(this.host.particleBackgroundController.settings.morphCurve);
    }
    this.particleMorphCurveDragState=undefined;
    this.particleMorphCurveFocusSnapshot=undefined;
    this.host.particleMorphCurveEditor.dataset.dragging="false";
    this.renderParticleMorphCurveEditor();
  }
  saveParticleMorphCurve(message: string): void {
    const curve=normalizeParticleMorphCurve(this.particleMorphCurveDraft);
    this.particleMorphCurveDraft=cloneParticleMorphCurve(curve);
    void this.host.particleBackgroundController.updateSettings(normalizeParticleSettings({
      ...this.host.particleBackgroundController.settings,
      morphCurve: curve,
    })).then(() => this.host.announce(`${message} · ${this.host.backgroundText("将在下次图片切换时生效","applies to the next image switch")}`)).catch((error: unknown) => {
      this.host.showActionNotice(
        error instanceof Error? error.message:"The morph curve could not be saved.",
        "error",
      );
    });
  }
  bindParticleMorphCurveEditor(): void {
    for(const [element,handle] of [
      [this.host.particleMorphCurveStartHandle,"start"],
      [this.host.particleMorphCurveEndHandle,"end"],
    ] as const) {
      element.addEventListener("pointerdown",(event) => {
        if(event.button!==0||this.host.particleBackgroundController.pending) return;
        event.preventDefault();
        element.focus({ preventScroll: true });
        this.particleMorphCurveDragState={
          pointerId: event.pointerId,
          kind: "handle",
          handle,
          targetElement: element,
          originalCurve: cloneParticleMorphCurve(this.particleMorphCurveDraft),
        };
        this.host.particleMorphCurveEditor.setPointerCapture?.(event.pointerId);
        this.host.particleMorphCurveEditor.dataset.dragging="true";
      });
      element.addEventListener("focus",() => {
        this.particleMorphCurveFocusSnapshot=cloneParticleMorphCurve(this.particleMorphCurveDraft);
      });
      element.addEventListener("blur",() => {
        if(!this.particleMorphCurveDragState) this.particleMorphCurveFocusSnapshot=undefined;
      });
      element.addEventListener("keydown",(event) => {
        if(this.host.particleBackgroundController.pending) return;
        const step=event.shiftKey? 0.05:0.01;
        let timeDelta=0;
        let progressDelta=0;
        if(event.key==="ArrowLeft") timeDelta=-step;
        else if(event.key==="ArrowRight") timeDelta=step;
        else if(event.key==="ArrowDown") progressDelta=-step;
        else if(event.key==="ArrowUp") progressDelta=step;
        else return;
        event.preventDefault();
        const curve=this.particleMorphCurveDraft;
        this.setParticleMorphCurveHandle(
          handle,
          (handle==="start"? curve.x1:curve.x2)+timeDelta,
          (handle==="start"? curve.y1:curve.y2)+progressDelta,
        );
        this.saveParticleMorphCurve(this.host.backgroundText("变形曲线已调整","Morph curve adjusted"));
      });
    }

    this.host.particleMorphCurveEditor.addEventListener("dblclick",(event) => {
      if(this.host.particleBackgroundController.pending) return;
      const target=event.target;
      if(
        target instanceof Element
        &&target.closest(".particle-morph-curve-handle, .particle-morph-curve-node")
      ) return;
      event.preventDefault();
      const value=this.particleMorphCurvePointerValue(event);
      this.addParticleMorphCurveNode(value.time,value.progress);
    });
    this.host.particleMorphCurveEditor.addEventListener("pointermove",(event) => {
      const drag=this.particleMorphCurveDragState;
      if(!drag||event.pointerId!==drag.pointerId) return;
      event.preventDefault();
      const value=this.particleMorphCurvePointerValue(event);
      if(drag.kind==="node") this.setParticleMorphCurveNode(drag.nodeIndex,value.time,value.progress);
      else this.setParticleMorphCurveHandle(drag.handle,value.time,value.progress);
    });
    this.host.particleMorphCurveEditor.addEventListener("pointerup",(event) => {
      this.finishParticleMorphCurveDrag(event,false);
    });
    this.host.particleMorphCurveEditor.addEventListener("pointercancel",(event) => {
      this.finishParticleMorphCurveDrag(event,true);
    });
    this.particleMorphCurveReset.addEventListener("click",() => {
      if(this.host.particleBackgroundController.pending) return;
      this.particleMorphCurveDraft=cloneParticleMorphCurve(DEFAULT_PARTICLE_MORPH_CURVE);
      this.particleMorphCurveSelectedNodeIndex=null;
      this.renderParticleMorphCurveEditor();
      this.saveParticleMorphCurve(this.host.backgroundText("变形曲线已重置为平滑","Morph curve reset to Smooth"));
    });
    this.renderParticleMorphCurveEditor();
  }
  syncParticleValueControl(control: ParticleValueControl,value: number): void {
    const formattedValue=control.definition.format(value);
    control.output.value=formattedValue;
    control.input.setAttribute("aria-valuetext",formattedValue);
    control.output.setAttribute(
      "aria-label",
      particleOutputAriaLabel(control.definition,formattedValue,this.host.backgroundSettingsLanguage),
    );
    if(control.editor.hidden) {
      control.editor.value=String(particleEditorNumber(control.definition,value));
    }
  }
  bindParticleValueEditor(control: ParticleValueControl): void {
    control.output.addEventListener("dblclick",(event) => {
      event.preventDefault();
      event.stopPropagation();
      this.beginParticleValueEditing(control);
    });
    control.output.addEventListener("keydown",(event) => {
      if(event.key!=="Enter"&&event.key!==" "&&event.key!=="F2") return;
      event.preventDefault();
      event.stopPropagation();
      this.beginParticleValueEditing(control);
    });
    control.editor.addEventListener("keydown",(event) => {
      if(event.key==="Enter") {
        event.preventDefault();
        event.stopPropagation();
        this.commitParticleValueEditor(control,true);
      } else if(event.key==="Escape") {
        event.preventDefault();
        event.stopPropagation();
        this.closeParticleValueEditor(control,true);
      }
    });
    control.editor.addEventListener("blur",() => this.commitParticleValueEditor(control,false));
  }
  beginParticleValueEditing(control: ParticleValueControl): void {
    if(control.input.disabled||!control.editor.hidden) return;
    this.cancelParticleValueEditors();
    control.editor.value=String(particleEditorNumber(control.definition,Number(control.input.value)));
    control.output.hidden=true;
    control.editor.hidden=false;
    control.editor.focus({ preventScroll: true });
    control.editor.select();
  }
  commitParticleValueEditor(control: ParticleValueControl,restoreFocus: boolean): void {
    if(control.editor.hidden) return;
    const enteredValue=control.editor.valueAsNumber;
    if(Number.isFinite(enteredValue)&&!control.input.disabled) {
      control.input.value=String(enteredValue/particleEditorScale(control.definition));
      this.closeParticleValueEditor(control,restoreFocus);
      control.input.dispatchEvent(new Event("input",{ bubbles: true }));
      control.input.dispatchEvent(new Event("change",{ bubbles: true }));
      return;
    }
    this.closeParticleValueEditor(control,restoreFocus);
  }
  closeParticleValueEditor(control: ParticleValueControl,restoreFocus: boolean): void {
    if(control.editor.hidden) return;
    control.editor.hidden=true;
    control.output.hidden=false;
    control.editor.value=String(particleEditorNumber(control.definition,Number(control.input.value)));
    if(restoreFocus&&control.output.isConnected) control.output.focus({ preventScroll: true });
  }
  cancelParticleValueEditors(): void {
    for(const control of this.host.particleNumericControls.values()) {
      this.closeParticleValueEditor(control,false);
    }
    for(const control of this.host.particleImageTransformControls.values()) {
      this.closeParticleValueEditor(control,false);
    }
  }
  async applyParticleSettingsFromControls(): Promise<void> {
    const current=this.host.particleBackgroundController.settings;
    const values: Record<string,unknown>={ ...current };
    for(const [key,{ input }] of this.host.particleNumericControls) values[key]=input.value;
    values.morphCurve=this.particleMorphCurveDraft;
    values.introEnabled=this.host.particleIntroEnabledInput.checked;
    values.autoSwitch=this.host.particleAutoSwitchInput.checked;
    values.showSourceImage=this.host.particleShowSourceInput.checked;
    values.backgroundColor=this.host.particleBackgroundColorInput.value;
    values.cursorInteraction=this.host.particleCursorInteractionInput.checked;
    await this.host.particleBackgroundController.updateSettings(normalizeParticleSettings(values));
  }
  particleImageTransformFromControls(): ParticleImageTransform {
    const values: Record<string,unknown>={};
    for(const [key,{ input }] of this.host.particleImageTransformControls) values[key]=input.value;
    return normalizeParticleImageTransform(values);
  }
  async saveParticleImageTransform(): Promise<void> {
    const id=this.particleTransformImageId;
    if(!id) return;
    await this.host.particleBackgroundController.updateImageTransform(id,this.particleImageTransformFromControls());
  }
  async resetParticleImageTransform(): Promise<void> {
    const id=this.particleTransformImageId;
    if(!id) return;
    for(const [key,control] of this.host.particleImageTransformControls) {
      const { input }=control;
      const value=DEFAULT_PARTICLE_IMAGE_TRANSFORM[key];
      input.value=String(value);
      this.syncParticleValueControl(control,value);
    }
    this.host.particleBackgroundController.previewImageTransform(id,DEFAULT_PARTICLE_IMAGE_TRANSFORM);
    await this.host.particleBackgroundController.updateImageTransform(id,DEFAULT_PARTICLE_IMAGE_TRANSFORM);
  }
  async onParticleLibraryClick(event: Event): Promise<void> {
    const target=event.target;
    if(!(target instanceof Element)) return;
    const button=target.closest<HTMLButtonElement>("button[data-particle-image-id]");
    if(!button||!this.host.particleLibraryGrid.contains(button)) return;
    const id=button.dataset.particleImageId;
    if(!id) return;
    const action=button.dataset.particleAction;
    if(action==="delete") {
      if(this.particleTransformImageId===id) {
        this.particleTransformImageId=null;
        this.host.particleBackgroundController.finishImageTransformEditing();
      }
      await this.host.particleBackgroundController.deleteImage(id);
    } else if(action==="adjust") {
      this.particleTransformImageId=id;
      this.renderParticleBackgroundPlugin();
      this.particleImageTransformEditor.scrollIntoView({ block: "nearest" });
      this.particleImageTransformEditor.focus({ preventScroll: true });
      const editingReady=await this.host.particleBackgroundController.beginImageTransformEditing(id);
      if(!this.particleSettingsOpen||this.particleTransformImageId!==id) return;
      if(!editingReady) this.particleTransformImageId=null;
      this.renderParticleBackgroundPlugin();
      if(editingReady) this.host.particleImageTransformControls.get("positionX")?.input.focus();
    } else {
      await this.host.particleBackgroundController.toggleImageSelection(id);
    }
  }
  renderParticleBackgroundPlugin(): void {
    this.host.backgroundPackageMarket?.queueRender();
    const controller=this.host.particleBackgroundController;
    const enabled=this.host.enabledAppearancePlugins.has(PARTICLE_BACKGROUND_PLUGIN_ID);
    const active=enabled&&controller.enabled;
    let status=enabled? "Enabled":"Disabled";
    if(controller.pending) status=enabled||controller.enabled? "Enabled · Applying":"Applying";
    else if(enabled&&!active) status="Enabled · Not applied";
    else if(active&&controller.error) status="Enabled · Notice";
    this.particleBackgroundStatus.textContent=status;
    this.particleBackgroundStatus.dataset.enabled=String(active);
    this.particleBackgroundStatus.dataset.pending=String(controller.pending);
    this.particleBackgroundCard.setAttribute("aria-busy",String(controller.pending));
    this.host.particleBackgroundButton.textContent=controller.pending? "Applying…":enabled? "Disable":"Enable";
    this.host.particleBackgroundButton.dataset.enabled=String(enabled);
    this.host.particleBackgroundButton.setAttribute("aria-pressed",String(enabled));
    this.host.particleBackgroundButton.setAttribute(
      "aria-label",
      controller.pending
        ? "Applying Particle Image Background"
        :`${enabled? "Disable":"Enable"} Particle Image Background`,
    );
    this.host.particleBackgroundButton.disabled=this.host.backgroundActions.busy;

    const settings=controller.settings;
    this.host.particleIntroEnabledInput.checked=settings.introEnabled;
    this.host.particleIntroEnabledInput.disabled=controller.pending;
    this.host.particleOpeningReplayButton.disabled=!active||controller.pending||!settings.introEnabled||!controller.settings.activeImageId;
    for(const [key,control] of this.host.particleNumericControls) {
      const { input,editor }=control;
      const value=settings[key];
      input.value=String(value);
      input.disabled=controller.pending;
      editor.disabled=input.disabled;
      if(editor.disabled) this.closeParticleValueEditor(control,false);
      this.syncParticleValueControl(control,value);
    }
    if(!this.particleMorphCurveDragState) {
      this.particleMorphCurveDraft=cloneParticleMorphCurve(settings.morphCurve);
    }
    this.renderParticleMorphCurveEditor();
    this.host.particleAutoSwitchInput.checked=settings.autoSwitch;
    this.host.particleShowSourceInput.checked=settings.showSourceImage;
    this.host.particleBackgroundColorInput.value=settings.backgroundColor;
    this.host.particleCursorInteractionInput.checked=settings.cursorInteraction;

    const records=controller.records;
    const selectedIds=new Set(settings.selectedImageIds);
    const transformRecord=records.find((record) => record.id===this.particleTransformImageId);
    this.particleTransformImageId=transformRecord?.id??null;
    this.particleImageTransformEditor.dataset.empty=String(!transformRecord);
    this.particleImageTransformEditor.setAttribute("aria-busy",String(controller.pending&&Boolean(transformRecord)));
    this.particleImageTransformThumb.hidden=!transformRecord;
    this.particleImageTransformName.textContent=transformRecord
      ? this.host.backgroundText(`正在调整：${transformRecord.name}`,`Adjusting: ${transformRecord.name}`)
      :this.host.backgroundText("选择照片","Select a photo");
    if(transformRecord) {
      this.particleImageTransformThumb.src=controller.thumbnailUrl(transformRecord);
    } else {
      this.particleImageTransformThumb.removeAttribute("src");
    }
    for(const [key,control] of this.host.particleImageTransformControls) {
      const { input,editor }=control;
      const value=transformRecord?.[key]??DEFAULT_PARTICLE_IMAGE_TRANSFORM[key];
      input.value=String(value);
      input.disabled=controller.pending||!transformRecord;
      editor.disabled=input.disabled;
      if(editor.disabled) this.closeParticleValueEditor(control,false);
      this.syncParticleValueControl(control,value);
    }
    this.host.particleImageTransformReset.disabled=controller.pending||!transformRecord||(
      transformRecord.positionX===DEFAULT_PARTICLE_IMAGE_TRANSFORM.positionX
      &&transformRecord.positionY===DEFAULT_PARTICLE_IMAGE_TRANSFORM.positionY
      &&transformRecord.zoom===DEFAULT_PARTICLE_IMAGE_TRANSFORM.zoom
    );
    this.particleSourceCount.textContent=records.length
      ? this.host.backgroundText(
        `${records.length} 个已保存 · ${selectedIds.size} 个已选`,
        `${records.length} saved · ${selectedIds.size} selected`,
      )
      :this.host.backgroundText("0 个已保存","0 saved");
    this.host.particleLibraryClear.disabled=controller.pending||selectedIds.size===0;
    this.host.particleLibraryUpload.disabled=controller.pending;
    this.host.particleAutoSwitchInput.disabled=controller.pending||selectedIds.size<2;
    this.host.particleShowSourceInput.disabled=controller.pending;
    this.host.particleBackgroundColorInput.disabled=controller.pending;
    this.host.particleCursorInteractionInput.disabled=controller.pending;

    const fragment=document.createDocumentFragment();
    if(!records.length) {
      const empty=document.createElement("p");
      empty.className="particle-library-empty";
      empty.textContent=this.host.backgroundText(
        "添加图片后按播放顺序选择。",
        "Add images, then select them in playback order.",
      );
      fragment.append(empty);
    }
    for(const record of records) {
      const orderIndex=settings.selectedImageIds.indexOf(record.id);
      const item=document.createElement("article");
      item.className="particle-library-item";
      if(orderIndex>=0) item.classList.add("is-selected");
      if(record.id===settings.activeImageId) item.classList.add("is-active");

      const selectButton=document.createElement("button");
      selectButton.className="particle-library-select";
      selectButton.type="button";
      selectButton.dataset.particleImageId=record.id;
      selectButton.dataset.particleAction="select";
      selectButton.disabled=controller.pending;
      selectButton.setAttribute("aria-pressed",String(orderIndex>=0));
      selectButton.setAttribute("aria-label",orderIndex>=0
        ? this.host.backgroundText(
          `从切换顺序移除 ${record.name}`,
          `Remove ${record.name} from the switching order`,
        )
        :this.host.backgroundText(
          `添加 ${record.name} 到切换顺序`,
          `Add ${record.name} to the switching order`,
        ));
      selectButton.title=record.name;
      const thumbnail=document.createElement("img");
      thumbnail.className="particle-library-thumb";
      thumbnail.src=controller.thumbnailUrl(record);
      thumbnail.alt="";
      thumbnail.loading="lazy";
      const name=document.createElement("span");
      name.className="particle-library-name";
      name.textContent=record.name;
      selectButton.append(thumbnail,name);
      item.append(selectButton);

      if(orderIndex>=0) {
        const order=document.createElement("span");
        order.className="particle-library-order";
        order.textContent=String(orderIndex+1);
        order.setAttribute("aria-hidden","true");
        item.append(order);
      }
      if(record.id===settings.activeImageId) {
        const live=document.createElement("span");
        live.className="particle-library-live";
        live.textContent=this.host.backgroundText("当前","LIVE");
        live.setAttribute("aria-hidden","true");
        item.append(live);
      }
      const adjustButton=document.createElement("button");
      adjustButton.className="particle-library-adjust";
      adjustButton.type="button";
      adjustButton.dataset.particleImageId=record.id;
      adjustButton.dataset.particleAction="adjust";
      adjustButton.innerHTML=icons.sliders;
      adjustButton.disabled=controller.pending;
      adjustButton.setAttribute("aria-pressed",String(record.id===this.particleTransformImageId));
      adjustButton.setAttribute(
        "aria-label",
        this.host.backgroundText(
          `调整 ${record.name} 的位置和缩放`,
          `Adjust position and zoom for ${record.name}`,
        ),
      );
      adjustButton.title=this.host.backgroundText("调整位置和缩放","Adjust position and zoom");
      item.append(adjustButton);
      const deleteButton=document.createElement("button");
      deleteButton.className="particle-library-delete";
      deleteButton.type="button";
      deleteButton.dataset.particleImageId=record.id;
      deleteButton.dataset.particleAction="delete";
      deleteButton.disabled=controller.pending;
      deleteButton.textContent="×";
      deleteButton.setAttribute(
        "aria-label",
        this.host.backgroundText(
          `从图片库删除 ${record.name}`,
          `Delete ${record.name} from the image library`,
        ),
      );
      deleteButton.title=this.host.backgroundText("删除图片","Delete image");
      item.append(deleteButton);
      fragment.append(item);
    }
    this.host.particleLibraryGrid.replaceChildren(fragment);
    const error=controller.error;
    this.particlePluginError.hidden=!error;
    this.particlePluginError.textContent=backgroundSettingsError(
      error,
      this.host.backgroundSettingsLanguage,
      "粒子图片背景",
      "Particle Image Background",
    );
    if(this.particleSettingsOpen) requestAnimationFrame(() => this.positionParticleSettingsPanel());
  }
  toggleParticleSettings(): void {
    this.host.closeOtherSettings();
    if(this.particleSettingsOpen) {
      this.closeParticleSettings(true);
      return;
    }
    if(!this.host.previewMarketOpen) this.host.togglePreviewMarket();
    this.host.closeOtherSettings();
    this.particleSettingsOpen=true;
    void ensureBackgroundPackage('particle-image').then(async () => {
      await this.host.particleBackgroundController.refreshLibrary();
      if(this.particleSettingsOpen) this.renderParticleBackgroundPlugin();
    }).catch(error => this.host.showActionNotice(error instanceof Error? error.message:String(error),'error'));
    this.host.particleSettingsTrigger.setAttribute("aria-expanded","true");
    this.renderParticleBackgroundPlugin();
    if(!this.host.particleSettingsPanel.matches(":popover-open")) this.host.particleSettingsPanel.showPopover();
    this.positionParticleSettingsPanel();
    queueMicrotask(() => {
      if(!this.particleSettingsOpen) return;
      this.positionParticleSettingsPanel();
      this.host.particleSettingsCloseButton.focus();
    });
  }
  closeParticleSettings(restoreFocus: boolean): void {
    if(!this.particleSettingsOpen&&!this.host.particleSettingsPanel.matches(":popover-open")) return;
    this.particleSettingsOpen=false;
    this.host.particleSettingsTrigger.setAttribute("aria-expanded","false");
    this.cancelParticleValueEditors();
    this.cancelParticleMorphCurveInteraction(true);
    this.host.particleBackgroundController.finishImageTransformEditing();
    this.particleTransformImageId=null;
    if(this.host.particleSettingsPanel.matches(":popover-open")) this.host.particleSettingsPanel.hidePopover();
    if(restoreFocus&&this.host.particleSettingsTrigger.isConnected) this.host.particleSettingsTrigger.focus();
  }
  positionParticleSettingsPanel(): void {
    if(!this.particleSettingsOpen||!this.host.particleSettingsPanel.matches(":popover-open")) return;
    const panel=this.host.particleSettingsPanel;
    const cardRect=this.particleBackgroundCard.getBoundingClientRect();
    const edge=12;
    const gap=8;
    const preferredWidth=344;
    const panelWidth=Math.min(preferredWidth,Math.max(240,window.innerWidth-edge*2));
    let left=cardRect.right+gap;
    let side="right";
    if(left+panelWidth>window.innerWidth-edge) {
      left=Math.max(edge,window.innerWidth-edge-panelWidth);
      side="overlay";
    }
    panel.style.width=`${panelWidth}px`;
    panel.style.maxHeight=`${Math.max(240,window.innerHeight-edge*2)}px`;
    const panelHeight=Math.min(panel.scrollHeight,Math.max(240,window.innerHeight-edge*2));
    const top=Math.min(
      Math.max(edge,cardRect.top),
      Math.max(edge,window.innerHeight-edge-panelHeight),
    );
    panel.style.left=`${Math.round(left)}px`;
    panel.style.top=`${Math.round(top)}px`;
    panel.style.setProperty(
      "--cle-particle-settings-anchor-y",
      `${Math.round(Math.min(panelHeight-18,Math.max(18,cardRect.top+cardRect.height*0.5-top)))}px`,
    );
    panel.dataset.side=side;
  }
}
