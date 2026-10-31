import type { MotionSettings } from './types';

export type Motion = { scale: number; angle: number };

function validateSettings(settings: MotionSettings): void {
  const values = [
    settings.zoom,
    settings.initialZoom,
    settings.rotation,
    settings.depth,
    settings.starSpeed,
    settings.speed,
    settings.focusX,
    settings.focusY,
  ];
  if (values.some((value) => !Number.isFinite(value))) throw new RangeError('INVALID_MOTION_SETTINGS');
  if (!Number.isInteger(settings.layerCount) || settings.layerCount < 2 || settings.layerCount > 24) {
    throw new RangeError('INVALID_LAYER_COUNT');
  }
  if (
    settings.zoom < 0 || settings.initialZoom <= 0 || settings.rotation < 0 ||
    settings.depth < 0 || settings.starSpeed < 0 || settings.speed < 0 ||
    settings.focusX < 0 || settings.focusX > 1 ||
    settings.focusY < 0 || settings.focusY > 1 ||
    (settings.direction !== 1 && settings.direction !== -1)
  ) throw new RangeError('INVALID_MOTION_SETTINGS');
}

export function getMotion(progress: number, settings: MotionSettings, depth = 0): Motion {
  validateSettings(settings);
  if (!Number.isFinite(progress) || !Number.isFinite(depth) || depth < 0) {
    throw new RangeError('INVALID_MOTION_PROGRESS');
  }

  const p = Math.max(0, Math.min(1, progress));
  const scale = settings.initialZoom * Math.exp(
    Math.log1p(settings.zoom) * p * settings.speed * (1 + depth * settings.depth * 4),
  );
  const angle = settings.direction * settings.rotation * Math.PI / 180 * p * settings.speed;
  return { scale, angle };
}

export function projectPoint(
  x: number,
  y: number,
  progress: number,
  settings: MotionSettings,
  depth = 0,
): { x: number; y: number } {
  if (!Number.isFinite(x) || !Number.isFinite(y)) throw new RangeError('INVALID_POINT');
  return projectPointWithMotion(
    x,
    y,
    getMotion(progress, settings, depth),
    settings.focusX,
    settings.focusY,
    1,
  );
}

export function projectPointWithMotion(
  x: number,
  y: number,
  motion: Motion,
  focusX: number,
  focusY: number,
  aspectRatio: number,
): { x: number; y: number } {
  if (
    !Number.isFinite(x) || !Number.isFinite(y) ||
    !Number.isFinite(focusX) || !Number.isFinite(focusY) ||
    !Number.isFinite(aspectRatio) || aspectRatio <= 0 ||
    !Number.isFinite(motion.scale) || motion.scale <= 0 ||
    !Number.isFinite(motion.angle)
  ) throw new RangeError('INVALID_POINT');
  const dx = (x - focusX) * aspectRatio * motion.scale;
  const dy = (y - focusY) * motion.scale;
  const cosine = Math.cos(motion.angle);
  const sine = Math.sin(motion.angle);
  return {
    x: focusX + (dx * cosine - dy * sine) / aspectRatio,
    y: focusY + dx * sine + dy * cosine,
  };
}

export function projectPointAspect(
  x: number,
  y: number,
  progress: number,
  settings: MotionSettings,
  aspectRatio: number,
  depth = 0,
): { x: number; y: number } {
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(aspectRatio) || aspectRatio <= 0) {
    throw new RangeError('INVALID_POINT');
  }
  return projectPointWithMotion(
    x,
    y,
    getMotion(progress, settings, depth),
    settings.focusX,
    settings.focusY,
    aspectRatio,
  );
}
