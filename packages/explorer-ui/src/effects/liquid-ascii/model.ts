import {DEFAULTS, RANGES as SHARED_RANGES, normalizeOptions} from './source/options.mjs';
import {recordCaughtRuntimeError} from '../../runtime-operations';
export const LIQUID_ASCII_BACKGROUND_PLUGIN_ID='code-codex.liquid-ascii-background';
export const LIQUID_ASCII_SETTINGS_KEY='code-codex:liquid-ascii-background:v1';
export type LiquidAsciiSettings=Record<string,number|string|boolean>&{backgroundColor:string;introEnabled:boolean};
export const DEFAULT_LIQUID_ASCII_SETTINGS={...DEFAULTS} as LiquidAsciiSettings;
export const RANGES:Record<string,readonly [number,number,number]>=SHARED_RANGES;
export const normalizeLiquidAsciiSettings=(input:unknown):LiquidAsciiSettings=>normalizeOptions(input && typeof input==='object' ? input : {}) as LiquidAsciiSettings;
export function readLiquidAsciiSettings():LiquidAsciiSettings {
 try{return normalizeLiquidAsciiSettings(JSON.parse(localStorage.getItem(LIQUID_ASCII_SETTINGS_KEY)??'{}'));}
 catch(error){recordCaughtRuntimeError('Liquid ASCII settings read',error);return {...DEFAULT_LIQUID_ASCII_SETTINGS};}
}
