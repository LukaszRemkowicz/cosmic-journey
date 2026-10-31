export type Language = 'pl' | 'en';

export type MotionSettings = {
  zoom: number;
  initialZoom: number;
  rotation: number;
  direction: 1 | -1;
  depth: number;
  layerCount: number;
  starSpeed: number;
  speed: number;
  focusX: number;
  focusY: number;
};

export const DEFAULT_MOTION: MotionSettings = {
  zoom: 0.3,
  initialZoom: 1,
  rotation: 0,
  direction: 1,
  depth: 1,
  layerCount: 12,
  starSpeed: 1,
  speed: 1,
  focusX: 0.5,
  focusY: 0.5,
};

export type OutputSettings = {
  duration: number;
  fps: number;
  height: number;
  bitrate: number;
};

export const DEFAULT_OUTPUT: OutputSettings = {
  duration: 10,
  fps: 90,
  height: 1080,
  bitrate: 16_000_000,
};

export type Star = {
  x: number;
  y: number;
  width: number;
  height: number;
  depth: number;
};

export type ImageLayer = {
  name: string;
  width: number;
  height: number;
  originalWidth: number;
  originalHeight: number;
  bitDepth: number;
  pixels: Uint8ClampedArray;
  stars: Star[];
  starOwnership?: Uint8Array;
};

export type SceneImages = {
  starless: ImageLayer;
  stars: ImageLayer;
};
