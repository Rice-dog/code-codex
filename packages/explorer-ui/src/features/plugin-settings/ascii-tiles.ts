import { ASCII_TILES_BACKGROUND_PLUGIN_ID as ID, DEFAULT_ASCII_TILES_SETTINGS, RANGES } from '../../effects/ascii-tiles/model';
import {ParameterSettingsController,parameterCardMarkup,parameterPanelMarkup,type ParameterPanelConfig,type ParameterSettingsPorts} from './parameter-panel';

const groups = [
  ['Grid and motion','网格与流动',['speed','glyphSize','tileDensity','tileShear','tileGap','opacity','dpr','paused']],
  ['Glass material','玻璃材质',['outlineWidth','outlineStrength','bevelWidth','bevelSoftness','refractionStrength','chromaticSpread','specularExponent','specularStrength']],
  ['Pattern and colors','图案与颜色',['patternFreqX','patternFreqY','patternFreqXY','glyphColor','recessColor','backgroundColor']],
  ['Interaction','交互波纹',['cursorInteraction','cursorRadius','cursorIntensity','cursorRecovery','waveSpeed','waveHeight','clickStrength']],
] as const;
const labels:Record<string,readonly [string,string,string?]>={
 speed:['Flow speed','流动速度','×'],glyphSize:['Glyph size','字符大小','px'],tileDensity:['Tile density','砖块密度'],tileShear:['Tile shear','砖块倾斜'],tileGap:['Tile gap','砖块间距','px'],opacity:['Opacity','不透明度'],dpr:['Pixel ratio limit','像素倍率上限','×'],paused:['Pause flow','暂停流动'],
 outlineWidth:['Edge width','边缘宽度','px'],outlineStrength:['Edge strength','边缘强度'],bevelWidth:['Bevel width','倒角宽度'],bevelSoftness:['Bevel softness','倒角柔和度'],refractionStrength:['Refraction','折射强度'],chromaticSpread:['Chromatic spread','色散'],specularExponent:['Highlight sharpness','高光锐度'],specularStrength:['Highlight strength','高光强度'],
 patternFreqX:['Horizontal frequency','水平频率'],patternFreqY:['Vertical frequency','垂直频率'],patternFreqXY:['Diagonal frequency','对角频率'],glyphColor:['Glyph color','字符颜色'],recessColor:['Gap color','砖缝颜色'],backgroundColor:['Background color','背景颜色'],cursorInteraction:['Tile interaction','砖块联动'],cursorRadius:['Interaction radius','交互半径','px'],cursorIntensity:['Drag strength','拖动强度'],cursorRecovery:['Wave decay','波动消退','s'],waveSpeed:['Propagation speed','传播速度'],waveHeight:['Wave height','波纹高度','px'],clickStrength:['Click strength','点击强度'],
};
const config:ParameterPanelConfig={id:ID,slug:'ascii-tiles',prefix:'ascii',nameEn:'ASCII Tiles Background',nameZh:'ASCII Tiles Background',groups,defaults:DEFAULT_ASCII_TILES_SETTINGS,labels,ranges:RANGES};
export const asciiTilesCardMarkup=()=>parameterCardMarkup(config);
export const asciiTilesPanelMarkup=()=>parameterPanelMarkup(config);

export type AsciiTilesSettingsPorts=ParameterSettingsPorts;
export class AsciiTilesSettingsController extends ParameterSettingsController {constructor(ports:ParameterSettingsPorts){super(ports,config);}}
