// constants responsibility; original state keys, defaults and lifecycle retained.
import { type BackgroundSettingsLanguage,type ParticleValueControlDefinition } from "../contracts/explorer-model";
import {
  type ParticleMorphCurve
} from "../particle-image-startup";



export function particleEditorScale(definition: ParticleValueControlDefinition): number {
  return definition.editorScale??1;
}



export function particleEditorNumber(definition: ParticleValueControlDefinition,value: number): number {
  return Number((value*particleEditorScale(definition)).toFixed(8));
}



export function bilingualLabelMarkup(zh: string,en: string,className="cle-bilingual-label"): string {
  return `
    <span class="${className}">
      <span class="cle-bilingual-label-zh" lang="zh-CN">${zh}</span>
      <span class="cle-bilingual-label-en" lang="en">${en}</span>
    </span>
  `;
}



export function backgroundSettingsText(language: BackgroundSettingsLanguage,zh: string,en: string): string {
  return language==="zh"? zh:en;
}



export function backgroundSettingsError(
  error: string|undefined,
  language: BackgroundSettingsLanguage,
  pluginZh: string,
  pluginEn: string,
): string {
  if(!error) return "";
  return language==="zh"? `${pluginZh}错误：${error}`:`${pluginEn} error: ${error}`;
}




export function particleOutputAriaLabel(
  definition: ParticleValueControlDefinition,
  formattedValue: string,
  language: BackgroundSettingsLanguage="zh",
): string {
  return language==="zh"
    ? `编辑${definition.labelZh}数值，当前值为 ${formattedValue}。`
    :`Edit ${definition.label} value. Current value ${formattedValue}.`;
}



export function particleMorphCurvesMatch(first: ParticleMorphCurve,second: ParticleMorphCurve,tolerance=0.002): boolean {
  if(
    Math.abs(first.x1-second.x1)>tolerance
    ||Math.abs(first.y1-second.y1)>tolerance
    ||Math.abs(first.x2-second.x2)>tolerance
    ||Math.abs(first.y2-second.y2)>tolerance
    ||first.nodes.length!==second.nodes.length
  ) return false;
  return first.nodes.every((node,index) => {
    const comparison=second.nodes[index];
    return Boolean(
      comparison
      &&Math.abs(node.time-comparison.time)<=tolerance
      &&Math.abs(node.progress-comparison.progress)<=tolerance
    );
  });
}
