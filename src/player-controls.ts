export type PlaybackKeyInput = {
  key?: string;
  code?: string;
  repeat?: boolean;
  altKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
  isComposing?: boolean;
  defaultPrevented?: boolean;
};

export function isPlaybackShortcut(event: PlaybackKeyInput): boolean {
  return (
    !event.repeat &&
    !event.altKey &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.shiftKey &&
    !event.isComposing &&
    !event.defaultPrevented &&
    (event.key === ' ' || event.key === 'Spacebar' || event.code === 'Space')
  );
}

export function wheelZoom(
  current: number,
  deltaY: number,
  deltaMode: number,
  stageHeight: number,
): number {
  if (
    !Number.isFinite(current) || current < 1 || current > 4 ||
    !Number.isFinite(deltaY) ||
    !Number.isInteger(deltaMode) || deltaMode < 0 || deltaMode > 2 ||
    !Number.isFinite(stageHeight) || stageHeight <= 0
  ) throw new RangeError('INVALID_VIEWER_ZOOM');

  const unit = deltaMode === 1 ? 16 : deltaMode === 2 ? stageHeight : 1;
  const pixels = Math.max(-240, Math.min(240, deltaY * unit));
  return Math.max(1, Math.min(4, current * Math.exp(-pixels * 0.002)));
}
