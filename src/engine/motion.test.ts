import { describe, expect, it } from 'vitest';
import { DEFAULT_MOTION } from './types';
import { getLayerMotions } from './layers';
import {
  getMotion,
  projectPoint,
  projectPointAspect,
  projectPointWithMotion,
} from './motion';

const motion = {
  ...DEFAULT_MOTION,
  rotation: 90,
};

describe('deterministic motion', () => {
  it('starts at the configured scale with no rotation', () => {
    expect(getMotion(0, { ...motion, initialZoom: 1.1 })).toEqual({ scale: 1.1, angle: 0 });
  });

  it('moves points radially from an off-center focus, with stars moving faster', () => {
    const source = { x: 0.75, y: 0.5 };
    expect(projectPoint(source.x, source.y, 1, { ...motion, rotation: 0 }, 0).x).toBeCloseTo(0.825);
    expect(projectPoint(source.x, source.y, 1, { ...motion, rotation: 0 }, 1).x).toBeGreaterThan(1);
  });

  it('rotates in image-space units so non-square images keep circular paths', () => {
    expect(projectPointAspect(0.75, 0.5, 1, { ...motion, zoom: 0 }, 2).y).toBeCloseTo(1);
  });

  it('reverses rotation with direction and clamps progress to the animation interval', () => {
    expect(getMotion(2, motion).angle).toBeCloseTo(Math.PI / 2);
    expect(getMotion(1, { ...motion, direction: -1 }).angle).toBeCloseTo(-Math.PI / 2);
    expect(getMotion(-1, motion)).toEqual(getMotion(0, motion));
  });

  it('rejects non-finite progress or invalid settings', () => {
    expect(() => getMotion(Number.NaN, motion)).toThrow(RangeError);
    expect(() => getMotion(0.5, { ...motion, speed: Number.POSITIVE_INFINITY })).toThrow(RangeError);
  });

  it('starts every depth plane at the same configured image pose', () => {
    const settings = { ...motion, initialZoom: 1, focusX: 0.2, focusY: 0.7 };
    const layers = getLayerMotions(0, settings);
    expect(layers).toHaveLength(12);
    expect(layers.every(({ scale, angle, opacity }) =>
      scale === 1 && angle === 0 && opacity === 1,
    )).toBe(true);
    expect(projectPointWithMotion(0.7, 0.4, layers[0], 0.2, 0.7, 0.75)).toEqual({ x: 0.7, y: 0.4 });
  });

  it('projects precomputed rotation in portrait image space', () => {
    expect(
      projectPointWithMotion(
        0.75,
        0.5,
        { scale: 1, angle: Math.PI / 2 },
        0.5,
        0.5,
        0.75,
      ).y,
    ).toBeCloseTo(0.6875);
  });

  it('removes relative plane travel when either star speed or intensity is zero', () => {
    for (const setting of [{ depth: 0 }, { starSpeed: 0 }]) {
      const layers = getLayerMotions(0.4, {
        ...motion,
        layerCount: 4,
        ...setting,
      });
      expect(layers.every(({ scale }) => scale === layers[0].scale)).toBe(true);
    }
  });

  it('lets stars travel with object zoom disabled', () => {
    const layers = getLayerMotions(0.4, {
      ...motion,
      layerCount: 4,
      zoom: 0,
      rotation: 0,
    });
    expect(layers[0].scale).toBe(1);
    expect(layers[3].scale).toBe(2);
  });

  it('moves near planes faster than middle and background planes', () => {
    const layers = getLayerMotions(0.2, {
      ...motion,
      layerCount: 3,
      zoom: 0,
      rotation: 0,
    });
    expect(layers[2].scale).toBeGreaterThan(layers[1].scale);
    expect(layers[1].scale).toBeGreaterThan(layers[0].scale);
  });

  it('fades near planes before their finite perspective scale reaches its cap', () => {
    const layers = getLayerMotions(1, {
      ...motion,
      layerCount: 24,
      starSpeed: 3,
      speed: 3,
      depth: 3,
      zoom: 1.5,
      initialZoom: 2,
    });
    expect(layers[23].opacity).toBe(0);
    expect(layers.every(({ scale, angle, opacity }) =>
      Number.isFinite(scale) && Number.isFinite(angle) && Number.isFinite(opacity),
    )).toBe(true);
  });

  it('fades the nearest plane gradually before fully culling it', () => {
    const settings = {
      ...motion,
      layerCount: 2,
      zoom: 0,
      rotation: 0,
    };
    const atStart = getLayerMotions(0.6, settings)[1].opacity;
    const duringFade = getLayerMotions(0.7, settings)[1].opacity;
    const culled = getLayerMotions(0.8, settings)[1].opacity;

    expect(atStart).toBe(1);
    expect(duringFade).toBeCloseTo(0.40625);
    expect(culled).toBe(0);
  });

  it('rejects out-of-range layer counts and invalid star speed', () => {
    for (const layerCount of [1, 25, 2.5, Number.NaN]) {
      expect(() => getLayerMotions(0, { ...motion, layerCount })).toThrow(RangeError);
    }
    for (const starSpeed of [-0.1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => getLayerMotions(0, { ...motion, starSpeed })).toThrow(RangeError);
    }
  });
});
