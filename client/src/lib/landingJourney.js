// A finite storyboard: read a checkpoint, trace a leg, then read the next stop.
const DWELL = 2200
const TRAVEL = 900
const FADE = 280
export const JOURNEY_DURATION = 3 * DWELL + 2 * TRAVEL

export function journeyFrame(elapsed) {
  const time = Math.max(0, elapsed)
  for (let index = 0; index < 3; index++) {
    const start = index * (DWELL + TRAVEL)
    if (time < start + DWELL) return { phase: 'stop', checkpoint: index, reached: index, progress: 0, leaving: time >= start + DWELL - FADE }
    if (index < 2 && time < start + DWELL + TRAVEL) return { phase: 'travel', checkpoint: null, reached: index, progress: (time - start - DWELL) / TRAVEL, leaving: false }
  }
  return { phase: 'done', checkpoint: null, reached: 2, progress: 1, leaving: false }
}
