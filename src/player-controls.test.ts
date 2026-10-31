import { describe, expect, it } from 'vitest';
import { isPlaybackShortcut, wheelZoom } from './player-controls';

describe('fullscreen player controls', () => {
  it('converts wheel deltas to centered zoom changes and clamps the view', () => {
    expect(wheelZoom(1, -100, 0, 800)).toBeCloseTo(Math.exp(0.2));
    expect(wheelZoom(2, 100, 0, 800)).toBeCloseTo(2 * Math.exp(-0.2));
    expect(wheelZoom(3.9, -1000, 0, 800)).toBe(4);
    expect(wheelZoom(1.1, 1000, 0, 800)).toBe(1);
  });

  it('normalizes line and page wheel deltas and caps large gestures', () => {
    expect(wheelZoom(1, -1, 1, 800)).toBeCloseTo(Math.exp(0.032));
    expect(wheelZoom(1, -1, 2, 800)).toBeCloseTo(Math.exp(0.48));
    expect(wheelZoom(1, -10000, 0, 800)).toBeCloseTo(Math.exp(0.48));
  });

  it('recognizes Space variants but ignores repeat, modifiers and composition', () => {
    expect(isPlaybackShortcut({ key: ' ', code: 'Space' })).toBe(true);
    expect(isPlaybackShortcut({ key: 'Spacebar' })).toBe(true);
    expect(isPlaybackShortcut({ code: 'Space' })).toBe(true);
    for (const event of [
      { key: ' ', repeat: true },
      { key: ' ', altKey: true },
      { code: 'Space', ctrlKey: true },
      { key: ' ', metaKey: true },
      { key: ' ', shiftKey: true },
      { key: ' ', isComposing: true },
      { key: ' ', defaultPrevented: true },
      { key: 'Enter', code: 'Enter' },
    ]) {
      expect(isPlaybackShortcut(event)).toBe(false);
    }
  });

  it('rejects malformed viewer zoom input', () => {
    expect(() => wheelZoom(Number.NaN, 0, 0, 800)).toThrow(RangeError);
    expect(() => wheelZoom(1, Number.POSITIVE_INFINITY, 0, 800)).toThrow(RangeError);
    expect(() => wheelZoom(1, 1, 3, 800)).toThrow(RangeError);
    expect(() => wheelZoom(1, 1, 2, 0)).toThrow(RangeError);
  });
});
