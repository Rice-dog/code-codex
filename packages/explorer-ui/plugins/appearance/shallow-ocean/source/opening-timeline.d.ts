export function openingPhases(duration?: number): { reveal: number; prelude: number };
export function openingTimeline(elapsed: number, duration?: number): {
  opacity: number;
  titleOpacity: number;
  titleY: number;
  cameraProgress: number;
};
