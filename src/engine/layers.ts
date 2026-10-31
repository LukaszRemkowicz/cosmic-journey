import { getMotion, type Motion } from './motion';
import type { MotionSettings, Star } from './types';

export type LayerMotion = Motion & { opacity: number };

function validateLayerCount(layerCount: number): void {
  if (!Number.isInteger(layerCount) || layerCount < 2 || layerCount > 24) {
    throw new RangeError('INVALID_LAYER_COUNT');
  }
}

export function assignStarLayers(
  stars: readonly Star[],
  layerCount: number,
): { indices: Uint8Array; counts: number[] } {
  validateLayerCount(layerCount);
  const indices = new Uint8Array(stars.length);
  const counts = Array<number>(layerCount).fill(0);
  const order = Array.from({ length: stars.length }, (_, index) => index);
  order.sort((a, b) => stars[a].depth - stars[b].depth || a - b);

  for (let rank = 0; rank < order.length; rank++) {
    const distance = order.length === 1 ? 0.5 : rank / (order.length - 1);
    const layer = Math.min(layerCount - 1, Math.floor(distance * distance * layerCount));
    indices[order[rank]] = layer;
    counts[layer]++;
  }

  return { indices, counts };
}

export function getLayerMotions(
  progress: number,
  settings: MotionSettings,
): LayerMotion[] {
  const background = getMotion(progress, settings, 0);
  const p = Math.max(0, Math.min(1, progress));

  return Array.from({ length: settings.layerCount }, (_, index) => {
    const distance = index / (settings.layerCount - 1);
    const remaining =
      1 -
      1.25 *
        p *
        settings.speed *
        settings.starSpeed *
        settings.depth *
        distance *
        distance;
    const perspective = 1 / Math.max(0.06, remaining);
    return {
      scale: background.scale * perspective,
      angle: background.angle,
      opacity: Math.max(0, Math.min(1, (remaining - 0.06) / 0.16)),
    };
  });
}
