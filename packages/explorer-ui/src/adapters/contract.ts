export interface RendererAdapter {
  readonly id: string;
  supportsVersion(version: string): boolean;
  qualifiesRenderer(root?: ParentNode): boolean;
  activeThreadId(root?: ParentNode): string | null;
}
