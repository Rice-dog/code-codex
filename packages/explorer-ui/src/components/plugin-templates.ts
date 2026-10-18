import { appearanceCardMarkup } from './plugin-card';
// Domain extracted from the original explorer composition; behavior and storage contracts retained.
import { BLINKING_SQUARES_DEFAULTS } from "../blinking-squares-settings";
import { AURORA_IONOSPHERE_BACKGROUND_PLUGIN_ID,AURORA_IONOSPHERE_NUMERIC_CONTROL_DEFINITIONS,BLACK_HOLE_BACKGROUND_PLUGIN_ID,BLACK_HOLE_NUMERIC_CONTROL_DEFINITIONS,BLINKING_SQUARES_BACKGROUND_PLUGIN_ID,CLOUD_TRAIN_BACKGROUND_PLUGIN_ID,GLOW_HORIZON_BACKGROUND_PLUGIN_ID,GLOW_HORIZON_NUMERIC_CONTROL_DEFINITIONS,HEAVENLY_CLOUD_BACKGROUND_PLUGIN_ID,HEAVENLY_CLOUD_NUMERIC_CONTROL_DEFINITIONS,MEDIA_PREVIEW_ROUTES,MILKY_WAY_BACKGROUND_PLUGIN_ID,MOUNTAIN_BACKGROUND_PLUGIN_ID,PARTICLE_BACKGROUND_ACCEPT,PARTICLE_BACKGROUND_PLUGIN_ID,PARTICLE_IMAGE_TRANSFORM_CONTROL_DEFINITIONS,PARTICLE_NUMERIC_CONTROL_DEFINITIONS,PIXEL_SCULPT_BACKGROUND_PLUGIN_ID,TRANSPARENT_BACKGROUND_PLUGIN_ID } from "../core/configuration/explorer";
import { type BlackHoleControlGroup,type BlackHoleNumericControlDefinition,type GlowHorizonControlGroup,type GlowHorizonNumericControlDefinition,type HeavenlyCloudControlGroup,type HeavenlyCloudNumericControlDefinition,type MediaPreviewRoute,type ParticleControlGroup,type ParticleValueControlDefinition,type PreviewerDefinition } from "../contracts/explorer-model";
import { bilingualLabelMarkup,particleEditorNumber,particleOutputAriaLabel } from "./parameter-format";
import { getFileIcon,icons } from "../icons";
import {
  DEFAULT_PARTICLE_BACKGROUND_SETTINGS,
  DEFAULT_PARTICLE_IMAGE_TRANSFORM
} from "../particle-image-startup";
import { type MilkyWayControlGroup } from "../plugin-host/backgrounds/milky-way";
import { STARTUP_BACKGROUNDS } from "../startup-background";
import {
  AuroraIonosphereControlGroup,
  AuroraIonosphereNumericControlDefinition,
  BLINKING_SQUARES_CONTROLS,
  CLOUD_TRAIN_CONTROLS,
  CLOUD_TRAIN_DEFAULTS,
  CLOUD_TRAIN_TINTS,
  DEFAULT_AURORA_IONOSPHERE_BACKGROUND_SETTINGS,
  DEFAULT_BLACK_HOLE_BACKGROUND_SETTINGS,
  DEFAULT_GLOW_HORIZON_BACKGROUND_SETTINGS,
  DEFAULT_HEAVENLY_CLOUD_BACKGROUND_SETTINGS,
  DEFAULT_MILKY_WAY_BACKGROUND_SETTINGS,
  MILKY_WAY_NUMERIC_CONTROL_DEFINITIONS,
  MOUNTAIN_CONTROLS,
  MOUNTAIN_DEFAULTS,
  MilkyWayNumericControlDefinition
} from "../startup-background-renderers";
import { DEFAULT_STARTUP_TRANSITION_SETTINGS,type StartupTransitionSettings } from "../startup-transition-plugin";


export function previewerCardMarkup(previewer: PreviewerDefinition): string {
  const extensionTags=previewer.extensions.map((extension) => `<span>${extension}</span>`).join("");
  return `
    <article class="preview-extension" data-preview-extension="${previewer.id}">
      <span class="preview-extension-icon" aria-hidden="true">${getFileIcon(previewer.iconFileName).markup}</span>
      <div class="preview-extension-copy">
        <div class="preview-extension-title-row">
          <h4>${previewer.title}</h4>
          <span class="preview-extension-status">Disabled</span>
        </div>
        <div class="preview-extension-meta">${extensionTags}</div>
      </div>
      <button class="preview-extension-action" type="button">Enable</button>
    </article>
  `;
}


export function gitHistoryCardMarkup(): string {
  return `
    <article class="preview-extension git-history-extension">
      <span class="preview-extension-icon" aria-hidden="true"><svg viewBox="0 0 16 16" focusable="false"><circle cx="4" cy="3" r="1.5"/><circle cx="4" cy="13" r="1.5"/><circle cx="12" cy="8" r="1.5"/><path d="M4 4.5v7M5.5 5.25C8 5.25 9 8 10.5 8"/></svg></span>
      <div class="preview-extension-copy">
        <div class="preview-extension-title-row">
          <h4>Git History</h4>
        </div>
        <div class="preview-extension-meta"><span>Commits</span><span>Diffs</span></div>
      </div>
      <button class="preview-extension-action git-history-open" type="button" aria-controls="cle-git-history" aria-expanded="false">Enable</button>
    </article>
  `;
}


export function gitHistoryPanelMarkup(): string {
  return `
    <section class="git-history-panel" id="cle-git-history" role="region" aria-label="Git History" hidden>
      <div class="git-history-toolbar">
        <div class="git-history-resize-handle" role="separator" aria-label="Resize Git History panel" aria-orientation="horizontal" aria-valuemin="120" tabindex="0">
          <span class="git-history-branch">Repository</span>
        </div>
        <div class="git-history-toolbar-actions">
          <button class="git-history-refresh" type="button" title="Refresh history" aria-label="Refresh Git history">${icons.refresh}</button>
          <button class="git-history-back" type="button" title="Back to history" aria-label="Back to Git history" hidden>${icons.collapse}</button>
          <button class="git-history-close" type="button" title="Close Git history" aria-label="Close Git history">${icons.close}</button>
        </div>
      </div>
      <div class="git-history-body">
        <section class="git-history-list-view">
          <div class="git-history-state" role="status">Open Git History to load commits.</div>
          <div class="git-history-list" role="list"></div>
          <button class="git-history-load-more" type="button" hidden>Load more</button>
        </section>
        <section class="git-history-detail-view" hidden>
          <div class="git-history-detail"></div>
        </section>
      </div>
    </section>
  `;
}


export function transparentBackgroundCardMarkup(): string {
  return `
    <article class="preview-extension appearance-extension" data-appearance-plugin="${TRANSPARENT_BACKGROUND_PLUGIN_ID}" aria-busy="false">
      <span class="preview-extension-icon" aria-hidden="true">${icons.preview}</span>
      <div class="preview-extension-copy">
        <div class="preview-extension-title-row">
          <h4>Transparent Background</h4>
          <span class="preview-extension-status" id="cle-transparent-background-status">Disabled</span>
        </div>
      </div>
      <button class="preview-extension-action" type="button" aria-describedby="cle-transparent-background-status" aria-pressed="false">Enable</button>
    </article>
  `;
}


export function particleValueEditorMarkup(definition: ParticleValueControlDefinition,value: number): string {
  const formattedValue=definition.format(value);
  return `
    <span class="particle-control-value">
      <output for="${definition.id}" tabindex="0" role="button" title="双击输入数值" aria-label="${particleOutputAriaLabel(definition,formattedValue)}">${formattedValue}</output>
      <input class="particle-value-editor" id="${definition.id}-value" type="number" inputmode="decimal" min="${particleEditorNumber(definition,definition.minimum)}" max="${particleEditorNumber(definition,definition.maximum)}" step="${particleEditorNumber(definition,definition.step)}" value="${particleEditorNumber(definition,value)}" aria-label="输入${definition.labelZh}" hidden>
    </span>
  `;
}


export function particleNumericControlsMarkup(group: ParticleControlGroup): string {
  return PARTICLE_NUMERIC_CONTROL_DEFINITIONS
    .filter((definition) => definition.group===group)
    .map((definition) => {
      const value=DEFAULT_PARTICLE_BACKGROUND_SETTINGS[definition.key];
      const formattedValue=definition.format(value);
      return `
        <div class="particle-control-row">
          <label for="${definition.id}">${bilingualLabelMarkup(definition.labelZh,definition.label)}</label>
          <input id="${definition.id}" data-particle-setting="${definition.key}" type="range" min="${definition.minimum}" max="${definition.maximum}" step="${definition.step}" value="${value}" aria-label="${definition.labelZh}" aria-valuetext="${formattedValue}">
          ${particleValueEditorMarkup(definition,value)}
        </div>
      `;
    })
    .join("");
}


export function particleImageTransformControlsMarkup(): string {
  return PARTICLE_IMAGE_TRANSFORM_CONTROL_DEFINITIONS
    .map((definition) => {
      const value=DEFAULT_PARTICLE_IMAGE_TRANSFORM[definition.key];
      return `
        <div class="particle-control-row">
          <label for="${definition.id}">${bilingualLabelMarkup(definition.labelZh,definition.label)}</label>
          <input id="${definition.id}" data-particle-image-transform="${definition.key}" type="range" min="${definition.minimum}" max="${definition.maximum}" step="${definition.step}" value="${value}" aria-label="${definition.labelZh}" aria-valuetext="${definition.format(value)}">
          ${particleValueEditorMarkup(definition,value)}
        </div>
      `;
    })
    .join("");
}


export function particleMorphCurveEditorMarkup(): string {
  return `
    <section class="particle-morph-curve-control" aria-labelledby="cle-particle-morph-curve-label">
      <header class="particle-morph-curve-head">
        <span id="cle-particle-morph-curve-label">${bilingualLabelMarkup("变形曲线","Morph curve","cle-bilingual-label cle-bilingual-label-compact")}</span>
        <span class="particle-morph-curve-actions">
          <span class="particle-morph-curve-mode">平滑</span>
          <button class="particle-morph-curve-reset" type="button">${bilingualLabelMarkup("重置","Reset")}</button>
        </span>
      </header>
      <svg class="particle-morph-curve-editor" viewBox="0 0 240 116" role="group" aria-labelledby="cle-particle-morph-curve-label" aria-describedby="cle-particle-morph-curve-help" data-disabled="false" data-dragging="false">
        <defs>
          <pattern id="cle-particle-morph-grid-pattern" width="53" height="22" patternUnits="userSpaceOnUse">
            <path class="particle-morph-curve-grid-line" d="M 53 0 L 0 0 0 22" fill="none"></path>
          </pattern>
        </defs>
        <rect class="particle-morph-curve-grid" x="14" y="12" width="212" height="88" fill="url(#cle-particle-morph-grid-pattern)"></rect>
        <path class="particle-morph-curve-diagonal" d="M 14 100 L 226 12"></path>
        <line class="particle-morph-curve-tangent particle-morph-curve-tangent-start"></line>
        <line class="particle-morph-curve-tangent particle-morph-curve-tangent-end"></line>
        <path class="particle-morph-curve-path-glow"></path>
        <path class="particle-morph-curve-path"></path>
        <g class="particle-morph-curve-nodes" role="group" aria-label="中间变形关键帧"></g>
        <path class="particle-morph-curve-keyframe" d="M 14 95 L 19 100 L 14 105 L 9 100 Z"></path>
        <path class="particle-morph-curve-keyframe" d="M 226 7 L 231 12 L 226 17 L 221 12 Z"></path>
        <g class="particle-morph-curve-handle particle-morph-curve-handle-start" data-handle="start" tabindex="0" role="slider" aria-label="输出控制点" aria-valuemin="0" aria-valuemax="100">
          <circle class="particle-morph-curve-hit" r="12"></circle>
          <circle class="particle-morph-curve-knob" r="5"></circle>
        </g>
        <g class="particle-morph-curve-handle particle-morph-curve-handle-end" data-handle="end" tabindex="0" role="slider" aria-label="输入控制点" aria-valuemin="0" aria-valuemax="100">
          <circle class="particle-morph-curve-hit" r="12"></circle>
          <circle class="particle-morph-curve-knob" r="5"></circle>
        </g>
        <text class="particle-morph-curve-axis cle-bilingual-label-zh" x="14" y="8" lang="zh-CN">变形</text>
        <text class="particle-morph-curve-axis cle-bilingual-label-en" x="14" y="8" lang="en">MORPH</text>
        <text class="particle-morph-curve-axis cle-bilingual-label-zh" x="226" y="111" text-anchor="end" lang="zh-CN">时间</text>
        <text class="particle-morph-curve-axis cle-bilingual-label-en" x="226" y="111" text-anchor="end" lang="en">TIME</text>
      </svg>
      <p class="particle-morph-curve-help" id="cle-particle-morph-curve-help">${bilingualLabelMarkup("双击添加关键帧 · 拖动移动 · Delete 删除","Double-click to add a keyframe · drag to move · Delete removes it")}</p>
    </section>
  `;
}


export function particleBackgroundCardMarkup(): string {
  return appearanceCardMarkup({ id: PARTICLE_BACKGROUND_PLUGIN_ID,icon: icons.preview,className: "particle-background-extension",title: "Particle Image Background",statusId: "cle-particle-background-status",settingsClass: "particle-settings-trigger",settingsId: "cle-particle-settings" });
}


export function particleSettingsPanelMarkup(): string {
  return `
    <section class="particle-settings-panel" id="cle-particle-settings" data-language="zh" lang="zh-CN" popover="manual" role="dialog" aria-modal="false" aria-labelledby="cle-particle-settings-title">
      <header class="particle-settings-header">
        <div class="particle-settings-heading">
          <p>${bilingualLabelMarkup("外观","Appearance")}</p>
          <h3 id="cle-particle-settings-title" data-plugin-name>Particle Image Background</h3>
        </div>
        <div class="particle-settings-header-actions">

          <button class="particle-settings-close" type="button" title="关闭粒子设置" aria-label="关闭粒子设置">${icons.close}</button>
        </div>
      </header>
      <div class="particle-settings-scroll">
        <fieldset class="particle-settings-group">
          <legend>${bilingualLabelMarkup("开场动画","Opening animation")}</legend>
          <label class="particle-toggle-row" for="cle-particle-intro-enabled">${bilingualLabelMarkup("粒子汇聚","Particle gathering")}<input id="cle-particle-intro-enabled" type="checkbox" checked></label>
          ${particleNumericControlsMarkup("opening")}
          <button class="particle-opening-replay" type="button" disabled>${bilingualLabelMarkup("重播开场","Replay opening")}</button>
        </fieldset>
        <fieldset class="particle-settings-group">
          <legend>${bilingualLabelMarkup("粒子","Particles")}</legend>
          ${particleNumericControlsMarkup("particles")}
        </fieldset>
        <fieldset class="particle-settings-group">
          <legend>${bilingualLabelMarkup("流动","Flow")}</legend>
          ${particleNumericControlsMarkup("flow")}
        </fieldset>
        <fieldset class="particle-settings-group">
          <legend>${bilingualLabelMarkup("来源","Source")}</legend>
          <details class="particle-source-details">
            <summary class="particle-source-summary">
              ${bilingualLabelMarkup("图片库","Image library")}
              <span class="particle-source-count">0 个已保存</span>
            </summary>
            <div class="particle-library-toolbar">
              <label class="particle-library-add">
                ${bilingualLabelMarkup("添加图片","Add images")}
                <input class="particle-library-upload" type="file" accept="${PARTICLE_BACKGROUND_ACCEPT}" multiple>
              </label>
              <button class="particle-library-clear" type="button" disabled>${bilingualLabelMarkup("清除顺序","Clear order")}</button>
            </div>
            <section class="particle-image-transform-editor" data-empty="true" tabindex="-1" aria-busy="false" aria-labelledby="cle-particle-image-transform-title cle-particle-image-transform-name">
              <header class="particle-image-transform-header">
                <div class="particle-image-transform-identity">
                  <img class="particle-image-transform-thumb" width="28" height="28" alt="" hidden>
                  <div>
                    <span id="cle-particle-image-transform-title">${bilingualLabelMarkup("图片取景","Photo framing")}</span>
                    <strong class="particle-image-transform-name" id="cle-particle-image-transform-name" aria-live="polite">选择照片</strong>
                  </div>
                </div>
                <button class="particle-image-transform-reset" type="button" disabled>${bilingualLabelMarkup("重置","Reset")}</button>
              </header>
              <div class="particle-image-transform-controls">
                ${particleImageTransformControlsMarkup()}
              </div>
              <p class="particle-image-transform-empty">${bilingualLabelMarkup("在图片上点击“调整”以设置位置和缩放。","Choose Adjust on a photo to set its position and zoom.")}</p>
            </section>
            <div class="particle-library-grid">
              <p class="particle-library-empty">${bilingualLabelMarkup("添加图片后按播放顺序选择。","Add images, then select them in playback order.")}</p>
            </div>
            <label class="particle-toggle-row" for="cle-particle-auto-switch">
              ${bilingualLabelMarkup("自动切换","Auto switch")}
              <input id="cle-particle-auto-switch" type="checkbox" checked>
            </label>
          </details>
          ${particleNumericControlsMarkup("source")}
          ${particleMorphCurveEditorMarkup()}
          <label class="particle-toggle-row" for="cle-particle-show-source">
            ${bilingualLabelMarkup("显示源图","Show source image")}
            <input id="cle-particle-show-source" type="checkbox" checked>
          </label>
          <label class="particle-color-row" for="cle-particle-background-color">
            ${bilingualLabelMarkup("背景","Background")}
            <input id="cle-particle-background-color" type="color" value="#000000">
          </label>
        </fieldset>
        <fieldset class="particle-settings-group">
          <legend>${bilingualLabelMarkup("指针","Pointer")}</legend>
          ${particleNumericControlsMarkup("pointer")}
          <label class="particle-toggle-row" for="cle-particle-cursor-interaction">
            ${bilingualLabelMarkup("鼠标交互","Cursor interaction")}
            <input id="cle-particle-cursor-interaction" type="checkbox" checked>
          </label>
        </fieldset>
        <fieldset class="particle-settings-group">
          <legend>${bilingualLabelMarkup("渲染","Render")}</legend>
          ${particleNumericControlsMarkup("render")}
        </fieldset>
        <p class="particle-plugin-error" role="status" hidden></p>
      </div>
    </section>
  `;
}


export function formatBlackHoleControlValue(definition: BlackHoleNumericControlDefinition,value: number): string {
  if(definition.percent) return `${Math.round(value*100)}%`;
  const precision=Math.max(0,(String(definition.step).split(".")[1]??"").length);
  return `${value.toFixed(precision)}${definition.unit??""}`;
}


export function blackHoleNumericControlsMarkup(group: BlackHoleControlGroup): string {
  return BLACK_HOLE_NUMERIC_CONTROL_DEFINITIONS
    .filter((definition) => definition.group===group)
    .map((definition) => {
      const value=DEFAULT_BLACK_HOLE_BACKGROUND_SETTINGS[definition.key];
      const formattedValue=formatBlackHoleControlValue(definition,value);
      return `
        <div class="particle-control-row" title="${definition.hintZh}" data-hint-zh="${definition.hintZh}" data-hint-en="${definition.hint}">
          <label for="${definition.id}">${bilingualLabelMarkup(definition.labelZh,definition.label)}</label>
          <input id="${definition.id}" data-black-hole-setting="${definition.key}" type="range" min="${definition.minimum}" max="${definition.maximum}" step="${definition.step}" value="${value}" aria-label="${definition.labelZh}" aria-valuetext="${formattedValue}">
          <span class="particle-control-value"><output for="${definition.id}">${formattedValue}</output></span>
        </div>
      `;
    })
    .join("");
}


export function blackHoleBackgroundCardMarkup(): string {
  const icon=`<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><circle cx="8" cy="8" r="2.25" fill="currentColor" stroke="none"/><ellipse cx="8" cy="8" rx="6.1" ry="3.15" transform="rotate(-18 8 8)"/><path d="M2.5 9.7c2.4 1.15 8.2 1.15 11-2.35"/></svg>`;
  return appearanceCardMarkup({ id: BLACK_HOLE_BACKGROUND_PLUGIN_ID,icon: icon,className: "black-hole-background-extension",title: "Black Hole Background",statusId: "cle-black-hole-background-status",settingsClass: "particle-settings-trigger black-hole-settings-trigger",settingsId: "cle-black-hole-settings" });
}


export function blackHoleSettingsPanelMarkup(): string {
  return `
    <section class="particle-settings-panel black-hole-settings-panel" id="cle-black-hole-settings" data-language="zh" lang="zh-CN" popover="manual" role="dialog" aria-modal="false" aria-labelledby="cle-black-hole-settings-title">
      <header class="particle-settings-header">
        <div class="particle-settings-heading">
          <p>${bilingualLabelMarkup("外观","Appearance")}</p>
          <h3 id="cle-black-hole-settings-title" data-plugin-name>Black Hole Background</h3>
        </div>
        <div class="particle-settings-header-actions">

          <button class="particle-settings-close black-hole-settings-close" type="button" title="关闭黑洞设置" aria-label="关闭黑洞设置">${icons.close}</button>
        </div>
      </header>
      <div class="particle-settings-scroll">
        <div class="black-hole-preset-toolbar" role="group" aria-label="黑洞场景预设">
          <button type="button" data-black-hole-preset="cinema">${bilingualLabelMarkup("电影","Cinema")}</button>
          <button type="button" data-black-hole-preset="lens">${bilingualLabelMarkup("透镜","Lens")}</button>
          <button type="button" data-black-hole-preset="ember">${bilingualLabelMarkup("余烬","Ember")}</button>
          <button class="black-hole-reset" type="button">${bilingualLabelMarkup("重置","Reset")}</button>
        </div>
        <fieldset class="particle-settings-group">
          <legend>${bilingualLabelMarkup("相机","Camera")}</legend>
          ${blackHoleNumericControlsMarkup("camera")}
        </fieldset>
        <fieldset class="particle-settings-group">
          <legend>${bilingualLabelMarkup("吸积盘","Accretion disc")}</legend>
          ${blackHoleNumericControlsMarkup("disc")}
        </fieldset>
        <fieldset class="particle-settings-group">
          <legend>${bilingualLabelMarkup("光线","Light")}</legend>
          ${blackHoleNumericControlsMarkup("light")}
          <label class="particle-color-row" for="cle-black-hole-hot-color">
            ${bilingualLabelMarkup("热色","Hot color")}
            <input id="cle-black-hole-hot-color" data-black-hole-color="hotColor" type="color" value="${DEFAULT_BLACK_HOLE_BACKGROUND_SETTINGS.hotColor}">
          </label>
          <label class="particle-color-row" for="cle-black-hole-mid-color">
            ${bilingualLabelMarkup("中间色","Mid color")}
            <input id="cle-black-hole-mid-color" data-black-hole-color="midColor" type="color" value="${DEFAULT_BLACK_HOLE_BACKGROUND_SETTINGS.midColor}">
          </label>
          <label class="particle-color-row" for="cle-black-hole-cool-color">
            ${bilingualLabelMarkup("冷色","Cool color")}
            <input id="cle-black-hole-cool-color" data-black-hole-color="coolColor" type="color" value="${DEFAULT_BLACK_HOLE_BACKGROUND_SETTINGS.coolColor}">
          </label>
        </fieldset>
        <fieldset class="particle-settings-group black-hole-renderer-settings" hidden>
          <legend>${bilingualLabelMarkup("渲染器","Renderer")}</legend>
          ${blackHoleNumericControlsMarkup("renderer")}
          <label class="particle-toggle-row" for="cle-black-hole-paused">
            ${bilingualLabelMarkup("暂停动画","Pause animation")}
            <input id="cle-black-hole-paused" type="checkbox">
          </label>
        </fieldset>
        <p class="particle-plugin-error black-hole-plugin-error" role="status" hidden></p>
      </div>
    </section>
  `;
}


export function formatGlowHorizonControlValue(
  definition: GlowHorizonNumericControlDefinition,
  value: number,
): string {
  const precision=definition.precision??Math.max(0,(String(definition.step).split(".")[1]??"").length);
  return `${value.toFixed(precision)}${definition.unit??""}`;
}


export function glowHorizonNumericControlsMarkup(group: GlowHorizonControlGroup): string {
  return GLOW_HORIZON_NUMERIC_CONTROL_DEFINITIONS
    .filter((definition) => definition.group===group)
    .map((definition) => {
      const value=DEFAULT_GLOW_HORIZON_BACKGROUND_SETTINGS[definition.key];
      const formatted=formatGlowHorizonControlValue(definition,value);
      return `
        <div class="particle-control-row">
          <label for="${definition.id}">${bilingualLabelMarkup(definition.labelZh,definition.label)}</label>
          <input id="${definition.id}" data-glow-horizon-setting="${definition.key}" type="range" min="${definition.minimum}" max="${definition.maximum}" step="${definition.step}" value="${value}" aria-label="${definition.labelZh}" aria-valuetext="${formatted}">
          <span class="particle-control-value"><output for="${definition.id}">${formatted}</output></span>
        </div>
      `;
    })
    .join("");
}


export function glowHorizonBackgroundCardMarkup(): string {
  const icon=`<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><ellipse cx="8" cy="9.5" rx="6.5" ry="3.3"/><path d="M1.8 8.5c1.8-2.4 10.6-2.4 12.4 0"/><path d="M3 6.4c1.9-1.5 8.1-1.5 10 0"/></svg>`;
  return appearanceCardMarkup({ id: GLOW_HORIZON_BACKGROUND_PLUGIN_ID,icon: icon,className: "glow-horizon-background-extension",title: "Glow Horizon Background",statusId: "cle-glow-horizon-background-status",settingsClass: "particle-settings-trigger glow-horizon-settings-trigger",settingsId: "cle-glow-horizon-settings" });
}


export function glowHorizonSettingsPanelMarkup(): string {
  return `
    <section class="particle-settings-panel glow-horizon-settings-panel" id="cle-glow-horizon-settings" data-glow-horizon-controls="panel" data-language="zh" lang="zh-CN" popover="manual" role="dialog" aria-modal="false" aria-labelledby="cle-glow-horizon-settings-title">
      <header class="particle-settings-header">
        <div class="particle-settings-heading">
          <p>${bilingualLabelMarkup("外观","Appearance")}</p>
          <h3 id="cle-glow-horizon-settings-title" data-plugin-name>Glow Horizon Background</h3>
        </div>
        <div class="particle-settings-header-actions">

          <button class="particle-settings-close glow-horizon-settings-close" type="button" title="关闭发光地平线设置" aria-label="关闭发光地平线设置">${icons.close}</button>
        </div>
      </header>
      <div class="particle-settings-scroll">
        <div class="glow-horizon-direction-toolbar" role="group" aria-label="地平线方向">
          <button type="button" data-glow-horizon-direction="top" aria-pressed="${DEFAULT_GLOW_HORIZON_BACKGROUND_SETTINGS.variant==="top"}"><span class="glow-horizon-direction-symbol">↑</span>${bilingualLabelMarkup("上","Top")}</button>
          <button type="button" data-glow-horizon-direction="bottom" aria-pressed="${DEFAULT_GLOW_HORIZON_BACKGROUND_SETTINGS.variant==="bottom"}"><span class="glow-horizon-direction-symbol">↓</span>${bilingualLabelMarkup("下","Bottom")}</button>
          <button type="button" data-glow-horizon-direction="left" aria-pressed="${DEFAULT_GLOW_HORIZON_BACKGROUND_SETTINGS.variant==="left"}"><span class="glow-horizon-direction-symbol">←</span>${bilingualLabelMarkup("左","Left")}</button>
          <button type="button" data-glow-horizon-direction="right" aria-pressed="${DEFAULT_GLOW_HORIZON_BACKGROUND_SETTINGS.variant==="right"}"><span class="glow-horizon-direction-symbol">→</span>${bilingualLabelMarkup("右","Right")}</button>
        </div>
        <fieldset class="particle-settings-group">
          <legend>${bilingualLabelMarkup("输入","Input")}</legend>
          ${glowHorizonNumericControlsMarkup("input")}
          <label class="particle-toggle-row" for="cle-glow-inertial-wheel">
            ${bilingualLabelMarkup("滚轮惯性","Wheel inertia")}
            <input id="cle-glow-inertial-wheel" type="checkbox" checked>
          </label>
        </fieldset>
        <fieldset class="particle-settings-group">
          <legend>${bilingualLabelMarkup("下滑动态","Downward slide")}</legend>
          ${glowHorizonNumericControlsMarkup("downward")}
        </fieldset>
        <fieldset class="particle-settings-group">
          <legend>${bilingualLabelMarkup("上滑动态","Upward slide")}</legend>
          ${glowHorizonNumericControlsMarkup("upward")}
        </fieldset>
        <fieldset class="particle-settings-group">
          <legend>${bilingualLabelMarkup("释放回弹","Release")}</legend>
          ${glowHorizonNumericControlsMarkup("release")}
        </fieldset>
        <fieldset class="particle-settings-group">
          <legend>${bilingualLabelMarkup("开场画面","Opening frame")}</legend>
          ${glowHorizonNumericControlsMarkup("entrance")}
        </fieldset>
        <fieldset class="particle-settings-group">
          <legend>${bilingualLabelMarkup("光效配色","Glow palette")}</legend>
          <label class="particle-color-row" for="cle-glow-rim-color">${bilingualLabelMarkup("亮边","Rim")}<input id="cle-glow-rim-color" data-glow-horizon-color="rimColor" type="color" value="${DEFAULT_GLOW_HORIZON_BACKGROUND_SETTINGS.rimColor}"></label>
          <label class="particle-color-row" for="cle-glow-violet-color">${bilingualLabelMarkup("紫光","Violet")}<input id="cle-glow-violet-color" data-glow-horizon-color="violetColor" type="color" value="${DEFAULT_GLOW_HORIZON_BACKGROUND_SETTINGS.violetColor}"></label>
          <label class="particle-color-row" for="cle-glow-blue-color">${bilingualLabelMarkup("蓝光","Blue")}<input id="cle-glow-blue-color" data-glow-horizon-color="blueColor" type="color" value="${DEFAULT_GLOW_HORIZON_BACKGROUND_SETTINGS.blueColor}"></label>
          <label class="particle-color-row" for="cle-glow-shadow-color">${bilingualLabelMarkup("暗部","Shadow")}<input id="cle-glow-shadow-color" data-glow-horizon-color="shadowColor" type="color" value="${DEFAULT_GLOW_HORIZON_BACKGROUND_SETTINGS.shadowColor}"></label>
        </fieldset>
        <div class="glow-horizon-actions">
          <button class="glow-horizon-reset" type="button">${bilingualLabelMarkup("重置","Reset")}</button>
          <button class="glow-horizon-replay" type="button">${bilingualLabelMarkup("重播","Replay")}</button>
        </div>
        <p class="particle-plugin-error glow-horizon-plugin-error" role="status" hidden></p>
      </div>
    </section>
  `;
}


export function formatHeavenlyCloudControlValue(
  definition: HeavenlyCloudNumericControlDefinition,
  value: number,
): string {
  const precision=definition.precision??Math.max(0,(String(definition.step).split(".")[1]??"").length);
  return `${value.toFixed(precision)}${definition.unit??""}`;
}


export function heavenlyCloudNumericControlsMarkup(group: HeavenlyCloudControlGroup): string {
  return HEAVENLY_CLOUD_NUMERIC_CONTROL_DEFINITIONS
    .filter((definition) => definition.group===group)
    .map((definition) => {
      const value=DEFAULT_HEAVENLY_CLOUD_BACKGROUND_SETTINGS[definition.key];
      const formatted=formatHeavenlyCloudControlValue(definition,value);
      return `
        <div class="particle-control-row">
          <label for="${definition.id}">${bilingualLabelMarkup(definition.labelZh,definition.label)}</label>
          <input id="${definition.id}" data-heavenly-cloud-setting="${definition.key}" type="range" min="${definition.minimum}" max="${definition.maximum}" step="${definition.step}" value="${value}" aria-label="${definition.labelZh}" aria-valuetext="${formatted}">
          <span class="particle-control-value"><output for="${definition.id}">${formatted}</output></span>
        </div>
      `;
    })
    .join("");
}


export function heavenlyCloudBackgroundCardMarkup(): string {
  const icon=`<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M2.1 10.9c.7-1.1 1.8-1.7 3.1-1.7.5-2 2.1-3.3 4.1-3.3 2.4 0 4.3 1.9 4.3 4.3 0 .2 0 .5-.1.7"/><path d="M1.7 12.2h12.7M3.4 14h9.1"/><path d="M6.1 8.6c.6-1.1 1.7-1.8 3-1.8"/></svg>`;
  return appearanceCardMarkup({ id: HEAVENLY_CLOUD_BACKGROUND_PLUGIN_ID,icon: icon,className: "heavenly-cloud-background-extension",title: "Heavenly Cloud Background",statusId: "cle-heavenly-cloud-background-status",settingsClass: "particle-settings-trigger heavenly-cloud-settings-trigger",settingsId: "cle-heavenly-cloud-settings" });
}


export function heavenlyCloudSettingsPanelMarkup(): string {
  return `
    <section class="particle-settings-panel heavenly-cloud-settings-panel" id="cle-heavenly-cloud-settings" data-language="zh" lang="zh-CN" popover="manual" role="dialog" aria-modal="false" aria-labelledby="cle-heavenly-cloud-settings-title">
      <header class="particle-settings-header">
        <div class="particle-settings-heading">
          <p>${bilingualLabelMarkup("外观","Appearance")}</p>
          <h3 id="cle-heavenly-cloud-settings-title" data-plugin-name>Heavenly Cloud Background</h3>
        </div>
        <div class="particle-settings-header-actions">

          <button class="particle-settings-close heavenly-cloud-settings-close" type="button" title="关闭天境云隧道设置" aria-label="关闭天境云隧道设置">${icons.close}</button>
        </div>
      </header>
      <div class="particle-settings-scroll">
        <fieldset class="particle-settings-group">
          <legend>${bilingualLabelMarkup("渲染质量","Render quality")}</legend>
          <div class="heavenly-cloud-quality-toolbar" role="group" aria-label="光线步数">
            <button type="button" data-heavenly-cloud-quality="low" aria-pressed="${DEFAULT_HEAVENLY_CLOUD_BACKGROUND_SETTINGS.quality==="low"}"><strong>56</strong>${bilingualLabelMarkup("低","Low")}</button>
            <button type="button" data-heavenly-cloud-quality="medium" aria-pressed="${DEFAULT_HEAVENLY_CLOUD_BACKGROUND_SETTINGS.quality==="medium"}"><strong>76</strong>${bilingualLabelMarkup("中","Medium")}</button>
            <button type="button" data-heavenly-cloud-quality="high" aria-pressed="${DEFAULT_HEAVENLY_CLOUD_BACKGROUND_SETTINGS.quality==="high"}"><strong>100</strong>${bilingualLabelMarkup("高","High")}</button>
          </div>
        </fieldset>
        <fieldset class="particle-settings-group">
          <legend>${bilingualLabelMarkup("云场","Cloud field")}</legend>
          ${heavenlyCloudNumericControlsMarkup("field")}
        </fieldset>
        <fieldset class="particle-settings-group">
          <legend>${bilingualLabelMarkup("交互","Interaction")}</legend>
          ${heavenlyCloudNumericControlsMarkup("interaction")}
        </fieldset>
        <fieldset class="particle-settings-group">
          <legend>${bilingualLabelMarkup("开场画面","Opening frame")}</legend>
          ${heavenlyCloudNumericControlsMarkup("opening")}
        </fieldset>
        <label class="particle-toggle-row heavenly-cloud-paused-row" for="cle-heavenly-cloud-paused">
          ${bilingualLabelMarkup("暂停动画","Pause animation")}
          <input id="cle-heavenly-cloud-paused" type="checkbox">
        </label>
        <div class="glow-horizon-actions heavenly-cloud-actions">
          <button class="heavenly-cloud-reset" type="button">${bilingualLabelMarkup("重置","Reset")}</button>
          <button class="heavenly-cloud-replay" type="button">${bilingualLabelMarkup("重播","Replay")}</button>
        </div>
        <p class="particle-plugin-error heavenly-cloud-plugin-error" role="status" hidden></p>
      </div>
    </section>
  `;
}


export function formatAuroraIonosphereControlValue(
  definition: AuroraIonosphereNumericControlDefinition,
  value: number,
): string {
  const precision=definition.precision??Math.max(0,(String(definition.step).split(".")[1]??"").length);
  return `${value.toFixed(precision)}${definition.unit??""}`;
}


export function auroraIonosphereNumericControlsMarkup(group: AuroraIonosphereControlGroup): string {
  return AURORA_IONOSPHERE_NUMERIC_CONTROL_DEFINITIONS
    .filter((definition) => definition.group===group)
    .map((definition) => {
      const value=DEFAULT_AURORA_IONOSPHERE_BACKGROUND_SETTINGS[definition.key];
      const formatted=formatAuroraIonosphereControlValue(definition,value);
      return `
        <div class="particle-control-row">
          <label for="${definition.id}">${bilingualLabelMarkup(definition.labelZh,definition.label)}</label>
          <input id="${definition.id}" data-aurora-ionosphere-setting="${definition.key}" type="range" min="${definition.minimum}" max="${definition.maximum}" step="${definition.step}" value="${value}" aria-label="${definition.labelZh}" aria-valuetext="${formatted}">
          <span class="particle-control-value"><output for="${definition.id}">${formatted}</output></span>
        </div>
      `;
    })
    .join("");
}


export function auroraIonosphereBackgroundCardMarkup(): string {
  const icon=`<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M1.8 11.9c1.3-4 2.8-6.1 4.2-6.1 1.5 0 1.6 4.4 3 4.4 1.2 0 2.1-2.7 3.3-5.9"/><path d="M3.1 13.6c1.4-2.5 2.6-3.7 3.7-3.7 1.2 0 1.8 2.1 3 2.1 1 0 1.9-1.2 2.8-3.4"/><path d="M3.4 3.3h.01M10.3 2.3h.01M13.5 7h.01"/></svg>`;
  return appearanceCardMarkup({ id: AURORA_IONOSPHERE_BACKGROUND_PLUGIN_ID,icon: icon,className: "aurora-ionosphere-background-extension",title: "Aurora Ionosphere Background",statusId: "cle-aurora-ionosphere-background-status",settingsClass: "particle-settings-trigger aurora-ionosphere-settings-trigger",settingsId: "cle-aurora-ionosphere-settings" });
}


export function auroraIonosphereSettingsPanelMarkup(): string {
  return `
    <section class="particle-settings-panel aurora-ionosphere-settings-panel" id="cle-aurora-ionosphere-settings" data-language="zh" lang="zh-CN" popover="manual" role="dialog" aria-modal="false" aria-labelledby="cle-aurora-ionosphere-settings-title">
      <header class="particle-settings-header">
        <div class="particle-settings-heading">
          <p>${bilingualLabelMarkup("外观","Appearance")}</p>
          <h3 id="cle-aurora-ionosphere-settings-title" data-plugin-name>Aurora Ionosphere Background</h3>
        </div>
        <div class="particle-settings-header-actions">

          <button class="particle-settings-close aurora-ionosphere-settings-close" type="button" title="关闭极光电离层设置" aria-label="关闭极光电离层设置">${icons.close}</button>
        </div>
      </header>
      <div class="particle-settings-scroll">
        <fieldset class="particle-settings-group">
          <legend>${bilingualLabelMarkup("渲染质量","Render quality")}</legend>
          <div class="heavenly-cloud-quality-toolbar aurora-ionosphere-quality-toolbar" role="group" aria-label="光幕采样">
            <button type="button" data-aurora-ionosphere-quality="low" aria-pressed="${DEFAULT_AURORA_IONOSPHERE_BACKGROUND_SETTINGS.quality==="low"}"><strong>32</strong>${bilingualLabelMarkup("轻量","Light")}</button>
            <button type="button" data-aurora-ionosphere-quality="medium" aria-pressed="${DEFAULT_AURORA_IONOSPHERE_BACKGROUND_SETTINGS.quality==="medium"}"><strong>50</strong>${bilingualLabelMarkup("均衡","Balanced")}</button>
            <button type="button" data-aurora-ionosphere-quality="high" aria-pressed="${DEFAULT_AURORA_IONOSPHERE_BACKGROUND_SETTINGS.quality==="high"}"><strong>72</strong>${bilingualLabelMarkup("精细","Fine")}</button>
          </div>
        </fieldset>
        <fieldset class="particle-settings-group">
          <legend>${bilingualLabelMarkup("电离层","Ionosphere field")}</legend>
          ${auroraIonosphereNumericControlsMarkup("field")}
        </fieldset>
        <fieldset class="particle-settings-group">
          <legend>${bilingualLabelMarkup("开场画面","Opening frame")}</legend>
          ${auroraIonosphereNumericControlsMarkup("opening")}
        </fieldset>
        <label class="particle-toggle-row aurora-ionosphere-paused-row" for="cle-aurora-ionosphere-paused">
          ${bilingualLabelMarkup("暂停动画","Pause animation")}
          <input id="cle-aurora-ionosphere-paused" type="checkbox">
        </label>
        <div class="glow-horizon-actions aurora-ionosphere-actions">
          <button class="aurora-ionosphere-reset" type="button">${bilingualLabelMarkup("重置","Reset")}</button>
          <button class="aurora-ionosphere-replay" type="button">${bilingualLabelMarkup("重播","Replay")}</button>
        </div>
        <p class="particle-plugin-error aurora-ionosphere-plugin-error" role="status" hidden></p>
      </div>
    </section>
  `;
}

export function formatMilkyWayControlValue(
  definition: MilkyWayNumericControlDefinition,
  value: number,
): string {
  const precision=definition.precision??Math.max(0,(String(definition.step).split(".")[1]??"").length);
  return `${value.toFixed(precision)}${definition.unit??""}`;
}


export function milkyWayNumericControlsMarkup(group: MilkyWayControlGroup): string {
  return MILKY_WAY_NUMERIC_CONTROL_DEFINITIONS
    .filter((definition) => definition.group===group)
    .map((definition) => {
      const value=DEFAULT_MILKY_WAY_BACKGROUND_SETTINGS[definition.key];
      const formatted=formatMilkyWayControlValue(definition,value);
      return `
        <div class="particle-control-row">
          <label for="${definition.id}">${bilingualLabelMarkup(definition.labelZh,definition.label)}</label>
          <input id="${definition.id}" data-milky-way-setting="${definition.key}" type="range" min="${definition.minimum}" max="${definition.maximum}" step="${definition.step}" value="${value}" aria-label="${definition.labelZh}" aria-valuetext="${formatted}">
          <span class="particle-control-value"><output for="${definition.id}">${formatted}</output></span>
        </div>
      `;
    })
    .join("");
}


export function milkyWayBackgroundCardMarkup(): string {
  const icon=`<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M1.8 11.9c1.3-4 2.8-6.1 4.2-6.1 1.5 0 1.6 4.4 3 4.4 1.2 0 2.1-2.7 3.3-5.9"/><path d="M3.1 13.6c1.4-2.5 2.6-3.7 3.7-3.7 1.2 0 1.8 2.1 3 2.1 1 0 1.9-1.2 2.8-3.4"/><path d="M3.4 3.3h.01M10.3 2.3h.01M13.5 7h.01"/></svg>`;
  return appearanceCardMarkup({ id: MILKY_WAY_BACKGROUND_PLUGIN_ID,icon: icon,className: "milky-way-background-extension",title: "Milky Way Background",statusId: "cle-milky-way-background-status",settingsClass: "particle-settings-trigger milky-way-settings-trigger",settingsId: "cle-milky-way-settings" });
}


export function milkyWaySettingsPanelMarkup(): string {
  return `
    <section class="particle-settings-panel milky-way-settings-panel" id="cle-milky-way-settings" data-language="zh" lang="zh-CN" popover="manual" role="dialog" aria-modal="false" aria-labelledby="cle-milky-way-settings-title">
      <header class="particle-settings-header">
        <div class="particle-settings-heading">
          <p>${bilingualLabelMarkup("外观","Appearance")}</p>
          <h3 id="cle-milky-way-settings-title" data-plugin-name>Milky Way Background</h3>
        </div>
        <div class="particle-settings-header-actions">

          <button class="particle-settings-close milky-way-settings-close" type="button" title="关闭银河光场设置" aria-label="关闭银河光场设置">${icons.close}</button>
        </div>
      </header>
      <div class="particle-settings-scroll">
        <fieldset class="particle-settings-group">
          <legend>${bilingualLabelMarkup("渲染质量","Render quality")}</legend>
          <div class="heavenly-cloud-quality-toolbar milky-way-quality-toolbar" role="group" aria-label="像素密度上限">
            <button type="button" data-milky-way-quality="low" aria-pressed="${DEFAULT_MILKY_WAY_BACKGROUND_SETTINGS.quality==="low"}"><strong>1×</strong>${bilingualLabelMarkup("轻量","Light")}</button>
            <button type="button" data-milky-way-quality="medium" aria-pressed="${DEFAULT_MILKY_WAY_BACKGROUND_SETTINGS.quality==="medium"}"><strong>2×</strong>${bilingualLabelMarkup("均衡","Balanced")}</button>
            <button type="button" data-milky-way-quality="high" aria-pressed="${DEFAULT_MILKY_WAY_BACKGROUND_SETTINGS.quality==="high"}"><strong>3×</strong>${bilingualLabelMarkup("精细","Fine")}</button>
          </div>
        </fieldset>
        <fieldset class="particle-settings-group">
          <legend>${bilingualLabelMarkup("运动与形态","Movement and form")}</legend>
          ${milkyWayNumericControlsMarkup("field")}
        </fieldset>
        <fieldset class="particle-settings-group">
          <legend>${bilingualLabelMarkup("开场画面","Opening frame")}</legend>
          ${milkyWayNumericControlsMarkup("opening")}
        </fieldset>
        <label class="particle-toggle-row milky-way-paused-row" for="cle-milky-way-paused">
          ${bilingualLabelMarkup("暂停动画","Pause animation")}
          <input id="cle-milky-way-paused" type="checkbox">
        </label>
        <label class="particle-toggle-row" for="cle-milky-way-intro-enabled">
          ${bilingualLabelMarkup("启用开场","Enable opening")}<input id="cle-milky-way-intro-enabled" type="checkbox">
        </label>
        <fieldset class="particle-settings-group"><legend>${bilingualLabelMarkup("五色调色板","Five-color palette")}</legend>
          ${DEFAULT_MILKY_WAY_BACKGROUND_SETTINGS.colors.map((color,i) => `<label class="particle-toggle-row">${bilingualLabelMarkup("颜色 "+(i+1),"Color "+(i+1))}<input type="color" data-milky-way-color="${i}" value="${color}" aria-label="Color ${i+1}"></label>`).join("")}
        </fieldset>
        <div class="glow-horizon-actions milky-way-actions">
          <button class="milky-way-reset" type="button">${bilingualLabelMarkup("重置","Reset")}</button>
          <button class="milky-way-replay" type="button">${bilingualLabelMarkup("重播","Replay")}</button>
        </div>
        <p class="particle-plugin-error milky-way-plugin-error" role="status" hidden></p>
      </div>
    </section>
  `;
}


export function pixelSculptCardMarkup(): string {
  return `<article class="preview-extension appearance-extension" data-appearance-plugin="${PIXEL_SCULPT_BACKGROUND_PLUGIN_ID}"><span class="preview-extension-icon" aria-hidden="true"><svg viewBox="0 0 16 16"><path d="M1 13 6 3l4 7 2-4 3 7ZM4 7l2 2 2-2" fill="none" stroke="currentColor"/></svg></span><div class="preview-extension-copy"><div class="preview-extension-title-row"><h4>Pixel Sculpt Background</h4><span class="preview-extension-status pixelSculpt-status">Disabled</span></div></div><div class="preview-extension-actions"><button type="button" class="preview-extension-action pixelSculpt-enable" aria-pressed="false">Enable</button><button class="particle-settings-trigger pixelSculpt-settings-trigger" type="button" aria-label="Configure Pixel Sculpt Background" aria-haspopup="dialog" aria-controls="cle-pixelSculpt-settings" aria-expanded="false">${icons.sliders}</button></div></article>`;
}

export function blinkingSquaresCardMarkup(): string {
  return `<article class="preview-extension appearance-extension" data-appearance-plugin="${BLINKING_SQUARES_BACKGROUND_PLUGIN_ID}" aria-busy="false"><span class="preview-extension-icon" aria-hidden="true"><svg viewBox="0 0 16 16" fill="currentColor"><rect x="1" y="1" width="3" height="3"/><rect x="7" y="2" width="2" height="2"/><rect x="12" y="1" width="3" height="3"/><rect x="2" y="8" width="2" height="2"/><rect x="7" y="7" width="3" height="3"/><rect x="12" y="9" width="2" height="2"/><rect x="1" y="12" width="3" height="3"/><rect x="8" y="13" width="2" height="2"/></svg></span><div class="preview-extension-copy"><div class="preview-extension-title-row"><h4>Blinking Squares Background</h4><span class="preview-extension-status blinkingSquares-status">Disabled</span></div></div><div class="preview-extension-actions"><button type="button" class="preview-extension-action blinkingSquares-enable" aria-pressed="false">Enable</button><button class="particle-settings-trigger blinkingSquares-settings-trigger" type="button" aria-label="Configure Blinking Squares Background" aria-haspopup="dialog" aria-controls="cle-blinkingSquares-settings" aria-expanded="false">${icons.sliders}</button></div></article>`;
}

export const STARTUP_TRANSITION_MARKET_VISIBLE=true;


export function startupTransitionCardMarkup(): string {
  return `<article class="preview-extension appearance-extension" data-appearance-plugin="code-codex.startup-transition" ${STARTUP_TRANSITION_MARKET_VISIBLE? "":"hidden aria-hidden=\"true\""}><span class="preview-extension-icon" aria-hidden="true"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="8" cy="8" r="6"/><path d="M8 2v3m0 6v3M2 8h3m6 0h3"/><circle cx="8" cy="8" r="1.5"/></svg></span><div class="preview-extension-copy"><div class="preview-extension-title-row"><h4>Codex Startup Transition</h4><span class="preview-extension-status startupTransition-status">Disabled</span></div></div><div class="preview-extension-actions"><button type="button" class="preview-extension-action startupTransition-enable" aria-pressed="false">Enable</button><button class="particle-settings-trigger startupTransition-settings-trigger" type="button" aria-label="Configure Codex Startup Transition" aria-haspopup="dialog" aria-controls="cle-startupTransition-settings" aria-expanded="false">${icons.sliders}</button></div></article>`;
}

export function startupTransitionPanelMarkup(): string {
  const controls: readonly [keyof Pick<StartupTransitionSettings,"minimumVisiblePercent"|"fadePercent">,string,string,number,number,number][]=[
    ["minimumVisiblePercent","最短展示比例","Minimum display",0,100,1],
    ["fadePercent","淡出比例","Fade",0,100,1],
  ];
  const videoControls: readonly [keyof Pick<StartupTransitionSettings,"playbackRate"|"videoBrightness">,string,string,number,number,number][]=[
    ["playbackRate","播放速度","Playback speed",0.5,2,0.05],
    ["videoBrightness","视频亮度","Video brightness",0.4,1.4,0.05],
  ];
  return `<section class="particle-settings-panel startupTransition-settings-panel" id="cle-startupTransition-settings" data-language="zh" lang="zh-CN" popover="manual" role="dialog" aria-modal="false" aria-labelledby="cle-startupTransition-title">
    <header class="particle-settings-header"><div class="particle-settings-heading"><p>${bilingualLabelMarkup("外观","Appearance")}</p><h3 id="cle-startupTransition-title" data-plugin-name>Codex Startup Transition</h3></div><div class="particle-settings-header-actions"><button class="particle-settings-close startupTransition-close" type="button" aria-label="Close settings">${icons.close}</button></div></header>
    <div class="particle-settings-scroll">
      <div class="particle-control-row"><label for="cle-startupTransition-source">${bilingualLabelMarkup("动画来源","Animation source")}</label><select id="cle-startupTransition-source"><option value="video">Video</option><option value="background">Background plugin</option></select></div>
      <div class="particle-control-row startupTransition-background-controls" hidden><label for="cle-startupTransition-background">${bilingualLabelMarkup("背景插件","Background plugin")}</label><select id="cle-startupTransition-background">${STARTUP_BACKGROUNDS.map(([id,name]) => `<option value="${id}">${name}</option>`).join("")}</select></div>
      <div class="particle-control-row startupTransition-background-fade" hidden><label for="cle-startupTransition-background-fade">${bilingualLabelMarkup("背景淡化时间","Background fade duration")}</label><input id="cle-startupTransition-background-fade" type="range" min="0.1" max="10" step="0.1" value="1"><span class="particle-control-value"><output>1.0 s</output></span></div>
      <div class="startupTransition-preview-workspace legacy-startup-workspace">
        <div class="startupTransition-preview-stage" aria-label="Startup transition preview"><video class="startupTransition-video-still" muted playsinline preload="metadata" hidden></video></div>
        <div class="startupTransition-timeline" role="group" aria-label="视频时间轴">
          <div class="startupTransition-timeline-heading"><strong>${bilingualLabelMarkup("视频时间轴","Video timeline")}</strong><output class="startupTransition-timeline-range"></output>
          <div class="startupTransition-transport" role="group" aria-label="Playback controls">
            <button class="startupTransition-jump-start" type="button" aria-label="Go to clip start"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5v14M18 5l-9 7 9 7z"/></svg></button>
            <button class="startupTransition-play" type="button" aria-label="Play" aria-pressed="false"><svg class="startupTransition-play-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m8 5 11 7-11 7z"/></svg><svg class="startupTransition-pause-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14M16 5v14"/></svg></button>
            <button class="startupTransition-jump-end" type="button" aria-label="Go to clip end"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 5v14M6 5l9 7-9 7z"/></svg></button>
          </div></div>
          <div class="startupTransition-timeline-ruler" aria-hidden="true"><span>0:00.0</span><span>0:01.3</span><span>0:02.5</span><span>0:03.8</span><span>0:05.0</span></div>
          <div class="startupTransition-timeline-track">
            <div class="startupTransition-timeline-frames" aria-hidden="true">${Array.from({ length: 7 },() => '<span class="startupTransition-timeline-frame"></span>').join("")}</div>
            <div class="startupTransition-timeline-empty">${bilingualLabelMarkup("选择视频后可拖动两端裁剪","Choose a video to drag its trim handles")}</div>
            <div class="startupTransition-timeline-selection" aria-hidden="true"></div>
            <div class="startupTransition-timeline-mask startupTransition-timeline-mask--left" aria-hidden="true"></div>
            <div class="startupTransition-timeline-mask startupTransition-timeline-mask--right" aria-hidden="true"></div>
            <div class="startupTransition-timeline-playhead" aria-hidden="true" hidden></div>
            <div class="startupTransition-timeline-handle" data-startup-timeline-edge="start" role="slider" tabindex="0" aria-orientation="horizontal" aria-label="片段起点" hidden><span></span></div>
            <div class="startupTransition-timeline-handle" data-startup-timeline-edge="end" role="slider" tabindex="0" aria-orientation="horizontal" aria-label="片段终点" hidden><span></span></div>
          </div>
          <div class="startupTransition-timeline-timing-track" role="group" aria-label="Clip timing ranges">
            <div class="startupTransition-timeline-timing-clip"><span class="startupTransition-timeline-minimum" tabindex="0"></span><span class="startupTransition-timeline-fade" tabindex="0"></span></div>
          </div>
        </div>
      </div>
      <section class="particle-settings-group particle-source-details startup-video-library startupTransition-library" open><header class="particle-source-summary">${bilingualLabelMarkup("视频素材库","Video library")}<span class="startup-examples-control"><button type="button" class="startup-examples-download">${bilingualLabelMarkup("下载示例","Download examples")}</button><span class="startup-examples-progress" role="progressbar" aria-label="Downloading startup examples" aria-valuemin="0" aria-valuemax="100" hidden><span class="startup-examples-progress-fill"></span><span class="startup-examples-progress-label"></span></span></span><span class="startup-video-library-count particle-source-count"></span></header>
        <div class="particle-library-toolbar"><input class="startupTransition-file" type="file" accept="video/*" multiple hidden><span class="startupTransition-library-summary"></span></div>
        <div class="particle-library-grid startupTransition-library-grid"></div>
        <div class="startup-video-pager"><button class="particle-library-clear startup-video-prev" type="button" aria-label="Previous page">‹</button><output class="startup-video-page"></output><button class="particle-library-clear startup-video-next" type="button" aria-label="Next page">›</button></div>
        <p class="startupTransition-video-info"></p>
      </section>
      <fieldset class="particle-settings-group startupTransition-parameter-grid"><legend>${bilingualLabelMarkup("视频外观","Video appearance")}</legend>
        ${videoControls.map(([key,zh,en,min,max,step]) => `<div class="particle-control-row"><label for="cle-startupTransition-${key}">${bilingualLabelMarkup(zh,en)}</label><input id="cle-startupTransition-${key}" data-startup-transition-setting="${key}" type="range" min="${min}" max="${max}" step="${step}" value="${DEFAULT_STARTUP_TRANSITION_SETTINGS[key]}"><span class="particle-control-value"><output></output></span></div>`).join("")}
        <div class="particle-control-row startupTransition-fit-row"><label for="cle-startupTransition-fit">${bilingualLabelMarkup("画面适配","Video fit")}</label><select id="cle-startupTransition-fit"><option value="cover">铺满</option><option value="contain">完整显示</option><option value="cinema">影院填充</option></select></div>
      </fieldset>
      <fieldset class="particle-settings-group startupTransition-parameter-grid"><legend>${bilingualLabelMarkup("播放时长","Timing")}</legend>${controls.map(([key,zh,en,min,max,step]) => `<div class="particle-control-row"><label for="cle-startupTransition-${key}">${bilingualLabelMarkup(zh,en)}</label><input id="cle-startupTransition-${key}" data-startup-transition-setting="${key}" type="range" min="${min}" max="${max}" step="${step}" value="${DEFAULT_STARTUP_TRANSITION_SETTINGS[key]}"><span class="particle-control-value"><output>${DEFAULT_STARTUP_TRANSITION_SETTINGS[key]}%</output></span></div>`).join("")}</fieldset>
      <div class="glow-horizon-actions"><button class="startupTransition-reset" type="button">${bilingualLabelMarkup("重置参数","Reset settings")}</button></div>
      <p class="particle-plugin-error startupTransition-error" role="alert" hidden></p>
    </div>
  </section>`;
}

export function blinkingSquaresPanelMarkup(): string {
  const control=([key,zh,en,min,max,step]: (typeof BLINKING_SQUARES_CONTROLS)[number]) => `<div class="particle-control-row"><label for="cle-blinkingSquares-${key}">${bilingualLabelMarkup(zh,en)}</label><input id="cle-blinkingSquares-${key}" data-blinking-squares-setting="${key}" type="range" min="${min}" max="${max}" step="${step}" value="${BLINKING_SQUARES_DEFAULTS[key]}"><span class="particle-control-value"><output>${BLINKING_SQUARES_DEFAULTS[key]}</output></span></div>`;
  const toggle=(key: "mouseInteraction"|"keyboardInteraction"|"introEnabled"|"paused",zh: string,en: string) => `<label class="particle-toggle-row">${bilingualLabelMarkup(zh,en)}<input type="checkbox" data-blinking-squares-toggle="${key}"></label>`;
  return `<section class="particle-settings-panel blinkingSquares-settings-panel" id="cle-blinkingSquares-settings" data-language="zh" lang="zh-CN" popover="manual" role="dialog" aria-modal="false" aria-labelledby="cle-blinkingSquares-title"><header class="particle-settings-header"><div class="particle-settings-heading"><p>${bilingualLabelMarkup("外观","Appearance")}</p><h3 id="cle-blinkingSquares-title" data-plugin-name>Blinking Squares Background</h3></div><div class="particle-settings-header-actions"><button class="particle-settings-close blinkingSquares-close" type="button" aria-label="Close settings">${icons.close}</button></div></header><div class="particle-settings-scroll"><fieldset class="particle-settings-group"><legend>${bilingualLabelMarkup("渐隐方向","Fade direction")}</legend><div class="heavenly-cloud-quality-toolbar">${(["right","left","top","bottom"] as const).map((direction) => `<button type="button" data-blinking-squares-direction="${direction}" aria-pressed="${direction==="right"}">${bilingualLabelMarkup(({ right: "右",left: "左",top: "上",bottom: "下" })[direction],direction[0]!.toUpperCase()+direction.slice(1))}</button>`).join("")}</div></fieldset><fieldset class="particle-settings-group"><legend>${bilingualLabelMarkup("方块与闪烁","Squares and twinkle")}</legend>${BLINKING_SQUARES_CONTROLS.slice(0,10).map(control).join("")}</fieldset><fieldset class="particle-settings-group"><legend>${bilingualLabelMarkup("交互与脉冲","Interaction and pulses")}</legend>${BLINKING_SQUARES_CONTROLS.slice(10,20).map(control).join("")}${toggle("mouseInteraction","鼠标交互","Mouse interaction")}${toggle("keyboardInteraction","键盘随机波纹","Keyboard waves")}${BLINKING_SQUARES_CONTROLS.slice(20,22).map(control).join("")}</fieldset><fieldset class="particle-settings-group"><legend>${bilingualLabelMarkup("开场与画质","Opening and quality")}</legend>${BLINKING_SQUARES_CONTROLS.slice(22).map(control).join("")}${toggle("introEnabled","启用开场","Enable opening")}${toggle("paused","暂停动画","Pause animation")}</fieldset><fieldset class="particle-settings-group"><legend>${bilingualLabelMarkup("颜色","Colors")}</legend><div class="particle-control-row"><label for="cle-blinkingSquares-squareColor">${bilingualLabelMarkup("方块颜色","Square color")}</label><input id="cle-blinkingSquares-squareColor" type="color" data-blinking-squares-color="squareColor" value="${BLINKING_SQUARES_DEFAULTS.squareColor}"></div><div class="particle-control-row"><label for="cle-blinkingSquares-backgroundColor">${bilingualLabelMarkup("背景颜色","Background color")}</label><input id="cle-blinkingSquares-backgroundColor" type="color" data-blinking-squares-color="backgroundColor" value="${BLINKING_SQUARES_DEFAULTS.backgroundColor}"></div></fieldset><div class="glow-horizon-actions"><button type="button" class="blinkingSquares-reset">${bilingualLabelMarkup("重置","Reset")}</button><button type="button" class="blinkingSquares-replay">${bilingualLabelMarkup("重播","Replay")}</button></div><p class="particle-plugin-error blinkingSquares-error" role="status" hidden></p></div></section>`;
}

export function pixelSculptPanelMarkup(): string {
  return `<section class="particle-settings-panel pixelSculpt-settings-panel" id="cle-pixelSculpt-settings" data-language="zh" lang="zh-CN" popover="manual" role="dialog" aria-modal="false" aria-labelledby="cle-pixelSculpt-title"><header class="particle-settings-header"><div class="particle-settings-heading"><p>${bilingualLabelMarkup("外观","Appearance")}</p><h3 id="cle-pixelSculpt-title" data-plugin-name>Pixel Sculpt Background</h3></div><div class="particle-settings-header-actions"><button class="particle-settings-close pixelSculpt-close" type="button" aria-label="Close settings">${icons.close}</button></div></header><div class="particle-settings-scroll"><p class="pixelSculpt-disabled">${bilingualLabelMarkup("插件尚未启用；这里的设置会在下次启用时生效。","The plugin is disabled; changes here apply the next time it is enabled.")}</p><div class="pixelSculpt-controls-host"></div><label class="particle-toggle-row pixelSculpt-paused-row">${bilingualLabelMarkup("暂停动画","Pause animation")}<input type="checkbox" class="pixelSculpt-paused"></label><div class="glow-horizon-actions pixelSculpt-actions"><button type="button" class="pixelSculpt-reset">${bilingualLabelMarkup("重置参数","Reset parameters")}</button></div><p class="particle-plugin-error pixelSculpt-error" role="status" hidden></p></div></section>`;
}


export function cloudTrainCardMarkup(): string {
  return `<article class="preview-extension appearance-extension" data-appearance-plugin="${CLOUD_TRAIN_BACKGROUND_PLUGIN_ID}"><span class="preview-extension-icon" aria-hidden="true"><svg viewBox="0 0 16 16"><path d="M1 13 6 3l4 7 2-4 3 7ZM4 7l2 2 2-2" fill="none" stroke="currentColor"/></svg></span><div class="preview-extension-copy"><div class="preview-extension-title-row"><h4>Cloud Train Background</h4><span class="preview-extension-status cloudTrain-status">Disabled</span></div></div><div class="preview-extension-actions"><button type="button" class="preview-extension-action cloudTrain-enable" aria-pressed="false">Enable</button><button class="particle-settings-trigger cloudTrain-settings-trigger" type="button" aria-label="Configure Cloud Train Background" aria-haspopup="dialog" aria-controls="cle-cloudTrain-settings" aria-expanded="false">${icons.sliders}</button></div></article>`;
}

export function cloudTrainPanelMarkup(): string {
  return `<section class="particle-settings-panel cloudTrain-settings-panel" id="cle-cloudTrain-settings" data-language="zh" lang="zh-CN" popover="manual" role="dialog" aria-modal="false" aria-labelledby="cle-cloudTrain-title"><header class="particle-settings-header"><div class="particle-settings-heading"><p>${bilingualLabelMarkup("外观","Appearance")}</p><h3 id="cle-cloudTrain-title" data-plugin-name>Cloud Train Background</h3></div><div class="particle-settings-header-actions"><button class="particle-settings-close cloudTrain-close" type="button" aria-label="Close settings">${icons.close}</button></div></header><div class="particle-settings-scroll"><fieldset class="particle-settings-group"><legend>${bilingualLabelMarkup("列车与云海","Train and clouds")}</legend>${CLOUD_TRAIN_CONTROLS.map(([key,zh,en,min,max,step]) => `<div class="particle-control-row"><label for="cle-cloudTrain-${key}">${bilingualLabelMarkup(zh,en)}</label><input id="cle-cloudTrain-${key}" data-cloudTrain-setting="${key}" type="range" min="${min}" max="${max}" step="${step}" value="${CLOUD_TRAIN_DEFAULTS[key]}"><span class="particle-control-value"><output>${CLOUD_TRAIN_DEFAULTS[key]}</output></span></div>`).join("")}</fieldset>${CLOUD_TRAIN_TINTS.map(([key,zh,en]) => `<div class="particle-control-row"><label for="cle-cloudTrain-${key}">${bilingualLabelMarkup(zh,en)}</label><input id="cle-cloudTrain-${key}" type="color" value="#ffffff"></div>`).join("")}<label class="particle-toggle-row">${bilingualLabelMarkup("启用开场动画","Enable opening")}<input type="checkbox" class="cloudTrain-intro-enabled"></label><label class="particle-toggle-row">${bilingualLabelMarkup("暂停动画","Pause animation")}<input type="checkbox" class="cloudTrain-paused"></label><div class="glow-horizon-actions"><button type="button" class="cloudTrain-reset">${bilingualLabelMarkup("重置","Reset")}</button><button type="button" class="cloudTrain-replay">${bilingualLabelMarkup("重播","Replay")}</button></div><p class="particle-plugin-error cloudTrain-error" role="status" hidden></p></div></section>`;
}


export function mountainCardMarkup(): string {
  return `<article class="preview-extension appearance-extension" data-appearance-plugin="${MOUNTAIN_BACKGROUND_PLUGIN_ID}"><span class="preview-extension-icon" aria-hidden="true"><svg viewBox="0 0 16 16"><path d="M1 13 6 3l4 7 2-4 3 7ZM4 7l2 2 2-2" fill="none" stroke="currentColor"/></svg></span><div class="preview-extension-copy"><div class="preview-extension-title-row"><h4>Layered Mountain Background</h4><span class="preview-extension-status mountain-status">Disabled</span></div></div><div class="preview-extension-actions"><button type="button" class="preview-extension-action mountain-enable" aria-pressed="false">Enable</button><button class="particle-settings-trigger mountain-settings-trigger" type="button" aria-label="Configure Layered Mountain Background" aria-haspopup="dialog" aria-controls="cle-mountain-settings" aria-expanded="false">${icons.sliders}</button></div></article>`;
}

export function mountainPanelMarkup(): string {
  return `<section class="particle-settings-panel mountain-settings-panel" id="cle-mountain-settings" data-language="zh" lang="zh-CN" popover="manual" role="dialog" aria-modal="false" aria-labelledby="cle-mountain-title"><header class="particle-settings-header"><div class="particle-settings-heading"><p>${bilingualLabelMarkup("外观","Appearance")}</p><h3 id="cle-mountain-title" data-plugin-name>Layered Mountain Background</h3></div><div class="particle-settings-header-actions"><button class="particle-settings-close mountain-close" type="button" aria-label="Close settings">${icons.close}</button></div></header><div class="particle-settings-scroll"><fieldset class="particle-settings-group"><legend>${bilingualLabelMarkup("山峦与氛围","Mountains and atmosphere")}</legend>${MOUNTAIN_CONTROLS.map(([key,zh,en,min,max,step]) => `<div class="particle-control-row"><label for="cle-mountain-${key}">${bilingualLabelMarkup(zh,en)}</label><input id="cle-mountain-${key}" data-mountain-setting="${key}" type="range" min="${min}" max="${max}" step="${step}" value="${MOUNTAIN_DEFAULTS[key]}"><span class="particle-control-value"><output>${MOUNTAIN_DEFAULTS[key]}</output></span></div>`).join("")}</fieldset><fieldset class="particle-settings-group"><legend>${bilingualLabelMarkup("渲染质量","Render quality")}</legend><div class="heavenly-cloud-quality-toolbar">${[[28,"流畅","Fast"],[42,"均衡","Balanced"],[57,"完整","Full"]].map(([steps,zh,en]) => `<button type="button" data-mountain-steps="${steps}" aria-pressed="${steps===57}">${bilingualLabelMarkup(String(zh),String(en))}</button>`).join("")}</div></fieldset><label class="particle-toggle-row">${bilingualLabelMarkup("暂停动画","Pause animation")}<input type="checkbox" class="mountain-paused"></label><div class="glow-horizon-actions"><button type="button" class="mountain-reset">${bilingualLabelMarkup("重置","Reset")}</button><button type="button" class="mountain-replay">${bilingualLabelMarkup("重播","Replay")}</button></div><p class="particle-plugin-error mountain-error" role="status" hidden></p></div></section>`;
}


export function mediaPreviewRoute(path: string): MediaPreviewRoute|undefined {
  const name=path.replaceAll("\\","/").split("/").at(-1)??path;
  const dot=name.lastIndexOf(".");
  if(dot<0||dot===name.length-1) return undefined;
  return MEDIA_PREVIEW_ROUTES[name.slice(dot+1).toLocaleLowerCase()];
}
