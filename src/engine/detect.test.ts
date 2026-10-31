import { describe, expect, it } from 'vitest';
import { detectStars, extractStars } from './detect';

function raster(width: number, height: number): Uint8ClampedArray {
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let i = 3; i < pixels.length; i += 4) pixels[i] = 255;
  return pixels;
}

function paint(pixels: Uint8ClampedArray, width: number, x: number, y: number, color: [number, number, number]): void {
  const offset = (y * width + x) * 4;
  pixels.set([...color, 255], offset);
}

describe('star cutout detection', () => {
  it('finds colored components, retains edge halos, ignores isolated hot pixels, and is deterministic', () => {
    const pixels = raster(20, 14);
    paint(pixels, 20, 6, 6, [80, 0, 0]);
    paint(pixels, 20, 7, 6, [240, 0, 0]);
    paint(pixels, 20, 15, 10, [0, 190, 0]);
    paint(pixels, 20, 15, 11, [0, 70, 0]);
    paint(pixels, 20, 0, 0, [0, 0, 220]);
    paint(pixels, 20, 0, 1, [0, 0, 55]);
    paint(pixels, 20, 10, 2, [255, 255, 255]);

    const stars = detectStars(pixels, 20, 14);
    expect(stars).toHaveLength(3);
    expect(stars.every(({ x, y, width, height, depth }) =>
      x >= 0 && x <= 1 && y >= 0 && y <= 1 && width > 0 && height > 0 && depth >= 0 && depth <= 1,
    )).toBe(true);
    expect(stars).toEqual(detectStars(pixels, 20, 14));
    expect(stars.some(({ x }) => x < 0.2)).toBe(true);
  });

  it('returns no stars for a black image', () => {
    expect(detectStars(raster(8, 8), 8, 8)).toEqual([]);
  });

  it('keeps separate cores whose padded image cutouts overlap', () => {
    const pixels = raster(12, 8);
    paint(pixels, 12, 3, 4, [220, 40, 0]);
    paint(pixels, 12, 3, 5, [80, 10, 0]);
    paint(pixels, 12, 6, 4, [20, 180, 255]);
    paint(pixels, 12, 6, 5, [0, 80, 100]);
    expect(detectStars(pixels, 12, 8)).toHaveLength(2);
  });

  it('keeps dense independent stars separate and assigns each source pixel one stable owner', () => {
    const columns = 60;
    const rows = 60;
    const width = columns * 5;
    const height = rows * 4;
    const pixels = raster(width, height);
    for (let row = 0; row < rows; row++) {
      for (let column = 0; column < columns; column++) {
        const x = 2 + column * 5;
        const y = 1 + row * 4;
        paint(pixels, width, x, y, [255, 245, 230]);
        paint(pixels, width, x + 1, y, [255, 245, 230]);
      }
    }

    const { stars, ownership } = extractStars(pixels, width, height);
    const ownerAt = (x: number, y: number) => {
      const offset = (y * width + x) * 4;
      return ownership[offset] + (ownership[offset + 1] << 8) + (ownership[offset + 2] << 16);
    };
    let sourcePixelsKeepTheirComponentOwner = true;
    for (let row = 0; row < rows; row++) {
      for (let column = 0; column < columns; column++) {
        const x = 2 + column * 5;
        const y = 1 + row * 4;
        const id = row * columns + column + 1;
        sourcePixelsKeepTheirComponentOwner &&= ownerAt(x, y) === id && ownerAt(x + 1, y) === id;
      }
    }
    expect(stars).toHaveLength(3600);
    expect(sourcePixelsKeepTheirComponentOwner).toBe(true);
    expect(Array.from({ length: width * height }, (_, pixel) => ownership[pixel * 4 + 3]).every((alpha) => alpha === 255)).toBe(true);
    expect(ownerAt(2, 1)).toBe(1);
    expect(ownerAt(3, 1)).toBe(1);
    expect(ownerAt(7, 1)).toBe(2);
    expect(ownerAt(5, 1)).toBe(1);
    expect(ownership[3]).toBe(255);
  });

  it('scales across increasing dense star grids without merging components', () => {
    for (const side of [20, 40, 60]) {
      const pixels = raster(side * 5, side * 4);
      for (let row = 0; row < side; row++) {
        for (let column = 0; column < side; column++) {
          const x = 2 + column * 5;
          const y = 1 + row * 4;
          paint(pixels, side * 5, x, y, [255, 255, 255]);
          paint(pixels, side * 5, x + 1, y, [255, 255, 255]);
        }
      }
      expect(detectStars(pixels, side * 5, side * 4)).toHaveLength(side * side);
    }
  });

  it('rejects pixel buffers whose dimensions do not match', () => {
    expect(() => detectStars(raster(3, 3), 4, 3)).toThrow(RangeError);
  });
});
