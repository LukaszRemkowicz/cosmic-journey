// Bound the extra instances even when the source contains tens of thousands of stars.
const MAX_REPLENISHMENT_STARS = 4096;
const EDGE_FADE = 0.03;

type ReplenishmentStar = {
  sourceIndex: number;
  x: number;
  y: number;
  phase: number;
};

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export function createReplenishmentStars(starCount: number): ReplenishmentStar[] {
  const count = Math.min(starCount, MAX_REPLENISHMENT_STARS);
  let seed = 42;
  const next = () => {
    seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
  return Array.from({ length: count }, (_, index) => ({
    sourceIndex: Math.floor((index + next()) * starCount / count),
    x: next(),
    y: next(),
    phase: next(),
  }));
}

export function getStarVisibility(x: number, y: number): number {
  return clamp01(Math.min(x, 1 - x, y, 1 - y) / EDGE_FADE);
}

export function getReplenishmentStrength(initial: number, visible: number, capacity: number): number {
  return capacity > 0 ? 0.65 * clamp01((initial - visible) / capacity) : 0;
}

export function getReplenishmentPose(
  star: ReplenishmentStar,
  travel: number,
  focusX: number,
  focusY: number,
) {
  const time = star.phase + travel;
  const phase = time - Math.floor(time);
  const spread = 0.75 + 0.3 * phase;
  return {
    x: focusX + (star.x - focusX) * spread,
    y: focusY + (star.y - focusY) * spread,
    scale: 0.5 + 0.3 * phase,
    // Both ends of each cycle are invisible so repositioning never flashes.
    opacity: clamp01(Math.min(phase, 1 - phase) / 0.2),
  };
}
