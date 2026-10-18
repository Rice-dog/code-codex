export type PluginCategory='appearance'|'file-preview'|'developer-tools';
export interface PluginPackage {
  id: string; name: string; category: PluginCategory; api: number; version: string;
  releaseTag: string;
  size: number; sha256: string; asset: string; relativePath?: string;
  capabilities?: string[]; dependencies?: string[];
  resources?: Array<{ releaseTag?: string; asset: string; size: number; sha256: string; relativePath?: string; kind?: string }>;
  defaultImageCount?: number;
}
export interface PluginModule { id: string; api: number; version: string; exports: Record<string,unknown>; }
