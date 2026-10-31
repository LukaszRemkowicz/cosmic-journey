import { describe, expect, it } from 'vitest';
import { getFrameCount, getOutputDimensions } from './export';

describe('export timing and dimensions', () => {
  it('preserves aspect ratio and rounds dimensions to even pixels', () => {
    expect(getOutputDimensions(728, 540, 1080)).toEqual({ width: 1456, height: 1080 });
    expect(getOutputDimensions(16, 9, 1080)).toEqual({ width: 1920, height: 1080 });
  });

  it('uses rounded duration times frame rate as exact frame count', () => {
    expect(getFrameCount({ duration: 10, fps: 90, height: 1080, bitrate: 16_000_000 })).toBe(900);
    expect(() => getFrameCount({ duration: 0, fps: 90, height: 1080, bitrate: 16_000_000 })).toThrow(RangeError);
  });
});
