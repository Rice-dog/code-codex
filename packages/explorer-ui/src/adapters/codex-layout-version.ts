/** The first verified Codex build whose conversation surface is wrapped by MainContentClip. */
export const CLIPPED_MAIN_LAYOUT_VERSION = "26.924.2738.0";

export function usesClippedMainLayout(version: string | undefined): boolean {
  if (!version || !/^\d+\.\d+\.\d+\.\d+$/.test(version)) return false;
  const current = version.split(".").map(Number);
  const minimum = CLIPPED_MAIN_LAYOUT_VERSION.split(".").map(Number);
  for (let index = 0; index < minimum.length; index += 1) {
    if (current[index]! !== minimum[index]!) return current[index]! > minimum[index]!;
  }
  return true;
}
