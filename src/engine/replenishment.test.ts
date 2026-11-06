import { describe, expect, it } from 'vitest';
import {
  createReplenishmentStars,
  getReplenishmentPose,
  getReplenishmentStrength,
  getStarVisibility,
} from './replenishment';

describe('star field replenishment', () => {
  it('replaces the loss relative to the opening frame, accounting for fade and cropping', () => {
    expect(getStarVisibility(0.5, 0.5)).toBe(1);
    expect(getStarVisibility(1.01, 0.5)).toBe(0);
    expect(getStarVisibility(0.99, 0.5)).toBeGreaterThan(0);
    expect(getStarVisibility(0.99, 0.5)).toBeLessThan(1);
    expect(getReplenishmentStrength(80, 80, 100)).toBe(0);
    expect(getReplenishmentStrength(80, 40, 100)).toBeGreaterThan(0);
    expect(getReplenishmentStrength(80, 0, 100)).toBeGreaterThan(
      getReplenishmentStrength(80, 40, 100),
    );
  });

  it('reuses source sprites and bounds the extra work for dense photos', () => {
    expect(createReplenishmentStars(0)).toEqual([]);
    const stars = createReplenishmentStars(100_000);
    expect(stars.length).toBeLessThan(100_000);
    expect(stars.length).toBeGreaterThan(0);
    expect(stars.every(({ sourceIndex }) => sourceIndex >= 0 && sourceIndex < 100_000)).toBe(true);
  });

  it('moves a star away from the flight target and fades it to zero when it recycles', () => {
    const star = { sourceIndex: 0, x: 0.8, y: 0.7, phase: 0 };
    const before = getReplenishmentPose(star, 0.25, 0.5, 0.5);
    const after = getReplenishmentPose(star, 0.75, 0.5, 0.5);
    expect(after.x).toBeGreaterThan(before.x);
    expect(after.scale).toBeGreaterThan(before.scale);
    expect(getReplenishmentPose(star, 1, 0.5, 0.5).opacity).toBe(0);
    expect(getReplenishmentPose(star, 1 - 1e-6, 0.5, 0.5).opacity).toBeLessThan(1e-4);
    expect(getReplenishmentPose(star, 0.25, 0.5, 0.5)).toEqual(before);
  });
});
