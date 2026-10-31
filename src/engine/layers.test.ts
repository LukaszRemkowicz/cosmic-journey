import { describe, expect, it } from 'vitest';
import { assignStarLayers } from './layers';
import type { Star } from './types';

function starsAtDepths(depths: number[]): Star[] {
  return depths.map((depth, index) => ({
    x: index / Math.max(1, depths.length - 1),
    y: 0.5,
    width: 0.01,
    height: 0.01,
    depth,
  }));
}

describe('discrete star layer assignment', () => {
  it('keeps source order for depth ties without mutating input', () => {
    const stars = starsAtDepths([0.1, 0.5, 0.1, 0.8, 0.9]);
    const before = stars.map((star) => ({ ...star }));

    const result = assignStarLayers(stars, 4);

    expect(result.indices).toEqual(Uint8Array.from([0, 1, 0, 2, 3]));
    expect(result.counts).toEqual([2, 1, 1, 1]);
    expect(stars).toEqual(before);
    expect(assignStarLayers(stars, 4)).toEqual(result);
  });

  it('puts more stars in distant planes while accounting for every star', () => {
    const result = assignStarLayers(
      starsAtDepths(Array.from({ length: 100 }, (_, index) => index / 99)),
      12,
    );

    expect(result.indices).toHaveLength(100);
    expect(result.counts.reduce((total, count) => total + count, 0)).toBe(100);
    expect(result.counts[0]).toBeGreaterThan(result.counts[11]);
  });

  it('keeps a broad far-plane population at the default layer count', () => {
    const result = assignStarLayers(
      starsAtDepths(Array.from({ length: 3802 }, (_, index) => index / 3801)),
      12,
    );

    expect(result.counts).toEqual([
      1098, 454, 349, 294, 259, 234, 216, 200, 188, 178, 170, 162,
    ]);
    expect(result.counts.slice(0, 6).reduce((sum, count) => sum + count, 0)).toBe(2688);
  });

  it('regroups the same ranked stars when layer count changes', () => {
    const stars = starsAtDepths([0, 0.25, 0.5, 0.75, 1]);

    expect(assignStarLayers(stars, 2).indices).toEqual(
      Uint8Array.from([0, 0, 0, 1, 1]),
    );
    expect(assignStarLayers(stars, 4).indices).toEqual(
      Uint8Array.from([0, 0, 1, 2, 3]),
    );
  });

  it('returns one zero count per plane for an empty source', () => {
    expect(assignStarLayers([], 6)).toEqual({
      indices: new Uint8Array(),
      counts: [0, 0, 0, 0, 0, 0],
    });
  });

  it('rejects layer counts outside integer bounds', () => {
    for (const layerCount of [1, 25, 2.5, Number.NaN]) {
      expect(() => assignStarLayers([], layerCount)).toThrow(RangeError);
    }
  });
});
