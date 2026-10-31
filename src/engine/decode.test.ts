import { describe, expect, it } from 'vitest';
import { normalizeSamples } from './decode';

describe('sample display mapping', () => {
  it('maps unsigned 16-bit grayscale by the full sample range and duplicates gray into RGB', () => {
    const rgba = normalizeSamples([new Uint16Array([0, 32768, 65535])], 3, 1, {
      sampleFormat: 'unsigned',
      bitDepth: 16,
      photometric: 'black-is-zero',
    });
    expect(Array.from(rgba)).toEqual([
      0, 0, 0, 255,
      128, 128, 128, 255,
      255, 255, 255, 255,
    ]);
  });

  it('uses float values in [0,1] directly and preserves grayscale alpha', () => {
    const rgba = normalizeSamples([
      new Float32Array([0.25, 0.75]),
      new Float32Array([1, 0.5]),
    ], 2, 1, {
      sampleFormat: 'float',
      bitDepth: 32,
      photometric: 'black-is-zero',
    });
    expect(Array.from(rgba)).toEqual([
      64, 64, 64, 255,
      191, 191, 191, 128,
    ]);
  });

  it('rejects out-of-range float values to preserve shared star/starless display mapping', () => {
    expect(() => normalizeSamples([
      new Float32Array([-2, 0]),
      new Float32Array([0, 2]),
      new Float32Array([1, 1]),
    ], 2, 1, {
      sampleFormat: 'float',
      bitDepth: 32,
      photometric: 'rgb',
    })).toThrow('FLOAT_RANGE_UNSUPPORTED');
    expect(() => normalizeSamples([new Uint8Array([1])], 2, 1, {
      sampleFormat: 'unsigned',
      bitDepth: 8,
      photometric: 'black-is-zero',
    })).toThrow(RangeError);
  });

  it('rejects out-of-range floating alpha and maps non-finite samples to black/transparent', () => {
    expect(() => normalizeSamples([
      new Float32Array([0.5]),
      new Float32Array([1.1]),
    ], 1, 1, {
      sampleFormat: 'float',
      bitDepth: 32,
      photometric: 'black-is-zero',
    })).toThrow('FLOAT_RANGE_UNSUPPORTED');

    const rgba = normalizeSamples([new Float32Array([Number.NaN, Number.POSITIVE_INFINITY])], 2, 1, {
      sampleFormat: 'float',
      bitDepth: 32,
      photometric: 'black-is-zero',
    });
    expect(Array.from(rgba)).toEqual([0, 0, 0, 255, 0, 0, 0, 255]);
  });
});
