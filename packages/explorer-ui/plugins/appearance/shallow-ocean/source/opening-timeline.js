// Shared by the render-worker camera and the compositor-only title/reveal.
export function openingPhases(duration = 5.2) {
  const prelude = Math.min(1.6, duration * .5);
  return { reveal: Math.min(.7, prelude * .5), prelude };
}
export function openingTimeline(elapsed, duration = 5.2) {
  const { reveal, prelude } = openingPhases(duration);
  const smooth = (a, b, x) => {
    const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  };
  return {
    opacity: smooth(0, reveal, elapsed),
    titleOpacity: smooth(reveal, reveal + (prelude - reveal) * .4, elapsed)
      * (1 - smooth(prelude, prelude + Math.min(.6, duration * .15), elapsed)),
    titleY: (1 - smooth(reveal, prelude, elapsed)) * 10,
    cameraProgress: Math.max(0, Math.min(1, (elapsed - prelude) / (duration - prelude))),
  };
}
