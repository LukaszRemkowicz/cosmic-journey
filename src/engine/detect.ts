import type { Star } from './types';

type Component = {
  id: number;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  area: number;
  flux: number;
};

type XEvent = { x: number; id: number; add: boolean };

const MAX_STAR_COMPONENTS = 100_000;

function medianFromHistogram(histogram: Uint32Array, count: number): number {
  const middle = Math.floor((count - 1) / 2);
  let total = 0;
  for (let value = 0; value < histogram.length; value++) {
    total += histogram[value];
    if (total > middle) return value;
  }
  return 0;
}

function coordinateNoise(x: number, y: number): number {
  let hash = Math.imul(x ^ 0x9e3779b9, 0x85ebca6b);
  hash = Math.imul(hash ^ y, 0xc2b2ae35);
  hash ^= hash >>> 16;
  return (hash >>> 0) / 0xffffffff;
}

function writeOwner(ownership: Uint8Array, pixel: number, id: number): void {
  const offset = pixel * 4;
  ownership[offset] = id & 0xff;
  ownership[offset + 1] = (id >>> 8) & 0xff;
  ownership[offset + 2] = (id >>> 16) & 0xff;
}

function pushMin(heap: number[], id: number): void {
  let index = heap.length;
  heap.push(id);
  while (index > 0) {
    const parent = (index - 1) >>> 1;
    if (heap[parent] <= id) break;
    heap[index] = heap[parent];
    index = parent;
  }
  heap[index] = id;
}

function popMin(heap: number[]): number {
  const minimum = heap[0];
  const last = heap.pop()!;
  if (heap.length === 0) return minimum;
  let index = 0;
  while (index * 2 + 1 < heap.length) {
    let child = index * 2 + 1;
    if (child + 1 < heap.length && heap[child + 1] < heap[child]) child++;
    if (heap[child] >= last) break;
    heap[index] = heap[child];
    index = child;
  }
  heap[index] = last;
  return minimum;
}

function fillCutoutOwnership(ownership: Uint8Array, width: number, height: number, components: Component[]): void {
  const startsByRow = Array.from({ length: height }, () => [] as Component[]);
  const endsByRow = Array.from({ length: height }, () => [] as number[]);
  for (const component of components) {
    startsByRow[component.minY].push(component);
    if (component.maxY + 1 < height) endsByRow[component.maxY + 1].push(component.id);
  }

  const active = new Map<number, Component>();
  const activeById = new Uint8Array(components.length + 1);
  for (let y = 0; y < height; y++) {
    for (const id of endsByRow[y]) active.delete(id);
    for (const component of startsByRow[y]) active.set(component.id, component);
    if (active.size === 0) continue;

    const events: XEvent[] = [];
    for (const component of active.values()) {
      events.push(
        { x: component.minX, id: component.id, add: true },
        { x: component.maxX + 1, id: component.id, add: false },
      );
    }
    events.sort((a, b) => a.x - b.x || a.id - b.id);

    const heap: number[] = [];
    let eventIndex = 0;
    while (eventIndex < events.length) {
      const startX = events[eventIndex].x;
      while (eventIndex < events.length && events[eventIndex].x === startX) {
        const event = events[eventIndex++];
        if (event.add) {
          activeById[event.id] = 1;
          pushMin(heap, event.id);
        } else {
          activeById[event.id] = 0;
        }
      }
      while (heap.length > 0 && activeById[heap[0]] === 0) popMin(heap);
      const endX = eventIndex < events.length ? events[eventIndex].x : width;
      const owner = heap[0] ?? 0;
      for (let x = startX; owner !== 0 && x < endX; x++) {
        const pixel = y * width + x;
        const offset = pixel * 4;
        if (ownership[offset] === 0 && ownership[offset + 1] === 0 && ownership[offset + 2] === 0) {
          writeOwner(ownership, pixel, owner);
        }
      }
    }
  }
}

export function extractStars(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
): { stars: Star[]; ownership: Uint8Array } {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0 ||
      width * height * 4 !== pixels.length) {
    throw new RangeError('INVALID_IMAGE_DIMENSIONS');
  }

  const pixelCount = width * height;
  const luminance = new Uint8Array(pixelCount);
  const histogram = new Uint32Array(256);
  let peak = 0;
  for (let pixel = 0, offset = 0; pixel < pixelCount; pixel++, offset += 4) {
    const value = pixels[offset + 3] === 0
      ? 0
      : Math.max(pixels[offset], pixels[offset + 1], pixels[offset + 2]);
    luminance[pixel] = value;
    histogram[value]++;
    peak = Math.max(peak, value);
  }

  const ownership = new Uint8Array(pixelCount * 4);
  for (let offset = 3; offset < ownership.length; offset += 4) ownership[offset] = 255;

  const median = medianFromHistogram(histogram, pixelCount);
  const deviations = new Uint32Array(256);
  for (let pixel = 0; pixel < pixelCount; pixel++) deviations[Math.abs(luminance[pixel] - median)]++;
  const deviation = medianFromHistogram(deviations, pixelCount);
  const threshold = Math.min(254, Math.max(median + 6, median + deviation * 4, peak * 0.025));
  if (peak <= threshold) return { stars: [], ownership };

  const components: Component[] = [];
  let stack = new Int32Array(Math.min(pixelCount, 1024));
  for (let start = 0; start < pixelCount; start++) {
    if (luminance[start] <= threshold) continue;

    const id = components.length + 1;
    let top = 0;
    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;
    let area = 0;
    let flux = 0;
    const push = (index: number) => {
      if (top === stack.length) {
        const expanded = new Int32Array(Math.min(pixelCount, Math.max(2, stack.length * 2)));
        expanded.set(stack);
        stack = expanded;
      }
      stack[top++] = index;
      const value = luminance[index];
      luminance[index] = 0;
      flux += value;
      writeOwner(ownership, index, id);
    };

    push(start);
    while (top > 0) {
      const index = stack[--top];
      const x = index % width;
      const y = Math.floor(index / width);
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
      area++;
      const firstY = Math.max(0, y - 1);
      const lastY = Math.min(height - 1, y + 1);
      const firstX = Math.max(0, x - 1);
      const lastX = Math.min(width - 1, x + 1);
      for (let neighborY = firstY; neighborY <= lastY; neighborY++) {
        for (let neighborX = firstX; neighborX <= lastX; neighborX++) {
          const neighbor = neighborY * width + neighborX;
          if (luminance[neighbor] > threshold) push(neighbor);
        }
      }
    }

    if (area >= 2) {
      if (components.length >= MAX_STAR_COMPONENTS) throw new RangeError('TOO_MANY_STARS');
      components.push({
        id,
        minX: Math.max(0, minX - 2),
        minY: Math.max(0, minY - 2),
        maxX: Math.min(width - 1, maxX + 2),
        maxY: Math.min(height - 1, maxY + 2),
        area,
        flux,
      });
    } else {
      writeOwner(ownership, start, 0);
    }
  }

  if (components.length === 0) return { stars: [], ownership };

  fillCutoutOwnership(ownership, width, height, components);

  let maxArea = 0;
  let maxFlux = 0;
  for (const component of components) {
    maxArea = Math.max(maxArea, component.area);
    maxFlux = Math.max(maxFlux, component.flux);
  }
  const stars = components.map((component) => {
    const cutoutWidth = component.maxX - component.minX + 1;
    const cutoutHeight = component.maxY - component.minY + 1;
    const centerX = (component.minX + component.maxX + 1) / 2;
    const centerY = (component.minY + component.maxY + 1) / 2;
    const sizeScore = Math.log1p(component.area) / Math.log1p(maxArea);
    const fluxScore = component.flux / maxFlux;
    const depth = Math.min(1, Math.max(0,
      0.55 * sizeScore + 0.25 * fluxScore + 0.2 * coordinateNoise(Math.round(centerX), Math.round(centerY)),
    ));
    return {
      x: centerX / width,
      y: centerY / height,
      width: cutoutWidth / width,
      height: cutoutHeight / height,
      depth,
    };
  });
  return { stars, ownership };
}

export function detectStars(pixels: Uint8ClampedArray, width: number, height: number): Star[] {
  return extractStars(pixels, width, height).stars;
}
