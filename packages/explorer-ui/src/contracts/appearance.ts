/** Settings depend on these commands, not a coordinator implementation or sibling effects. */
export interface BackgroundCommands {
  readonly busy: boolean;
  initialize(id: string, generation: number): Promise<void>;
  toggle(id: string): Promise<void>;
  deactivate(id: string): Promise<void>;
}
