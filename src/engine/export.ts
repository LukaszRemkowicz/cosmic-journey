import { StarfieldRenderer } from './renderer';
import type { MotionSettings, OutputSettings, SceneImages } from './types';

const MAX_EXPORT_FRAMES = 100_000;

function validateOutput(output: OutputSettings): void {
  if (!Number.isFinite(output.duration) || output.duration <= 0 ||
      !Number.isSafeInteger(output.fps) || output.fps <= 0 ||
      !Number.isSafeInteger(output.height) || output.height <= 0 ||
      !Number.isFinite(output.bitrate) || output.bitrate <= 0) {
    throw new RangeError('INVALID_OUTPUT_SETTINGS');
  }
}

function roundEven(value: number): number {
  return Math.max(2, Math.round(value / 2) * 2);
}

export function getOutputDimensions(
  sourceWidth: number,
  sourceHeight: number,
  height: number,
): { width: number; height: number } {
  if (!Number.isSafeInteger(sourceWidth) || !Number.isSafeInteger(sourceHeight) ||
      !Number.isSafeInteger(height) || sourceWidth <= 0 || sourceHeight <= 0 || height <= 0) {
    throw new RangeError('INVALID_OUTPUT_DIMENSIONS');
  }
  const outputHeight = roundEven(height);
  const outputWidth = roundEven(sourceWidth / sourceHeight * outputHeight);
  return { width: outputWidth, height: outputHeight };
}

export function getFrameCount(output: OutputSettings): number {
  validateOutput(output);
  const frames = Math.round(output.duration * output.fps);
  if (!Number.isSafeInteger(frames) || frames < 1 || frames > MAX_EXPORT_FRAMES) {
    throw new RangeError('INVALID_FRAME_COUNT');
  }
  return frames;
}

function abortError(): DOMException {
  return new DOMException('The export was aborted.', 'AbortError');
}

function yieldToMainThread(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

export async function exportMp4(
  images: SceneImages,
  motion: MotionSettings,
  outputSettings: OutputSettings,
  onProgress: (progress: number) => void,
  signal: AbortSignal,
): Promise<Blob> {
  if (signal.aborted) throw abortError();
  const frameCount = getFrameCount(outputSettings);
  if (images.starless.width !== images.stars.width || images.starless.height !== images.stars.height) {
    throw new RangeError('IMAGE_DIMENSION_MISMATCH');
  }
  const { width, height } = getOutputDimensions(
    images.starless.width,
    images.starless.height,
    outputSettings.height,
  );

  const media = await import('mediabunny');
  if (signal.aborted) throw abortError();
  if (!await media.canEncodeVideo('avc', {
    width,
    height,
    frameRate: outputSettings.fps,
    bitrate: outputSettings.bitrate,
  })) {
    throw new Error('MP4_UNSUPPORTED');
  }
  if (signal.aborted) throw abortError();

  let canvas: HTMLCanvasElement | undefined;
  let renderer: StarfieldRenderer | undefined;
  let target: InstanceType<typeof media.BufferTarget> | undefined;
  let mediaOutput: InstanceType<typeof media.Output> | undefined;
  let source: InstanceType<typeof media.CanvasSource> | undefined;
  let cancelPromise: Promise<void> | undefined;
  const cancelOutput = (): Promise<void> => {
    if (!mediaOutput) return Promise.resolve();
    if (mediaOutput.state === 'finalized' || mediaOutput.state === 'canceled') return Promise.resolve();
    cancelPromise ??= mediaOutput.cancel();
    return cancelPromise;
  };
  const onAbort = () => { void cancelOutput().catch(() => undefined); };
  signal.addEventListener('abort', onAbort, { once: true });

  try {
    canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    renderer = new StarfieldRenderer(canvas, images);
    renderer.resize(width, height);
    target = new media.BufferTarget();
    mediaOutput = new media.Output({
      format: new media.Mp4OutputFormat({ fastStart: false }),
      target,
    });
    source = new media.CanvasSource(canvas, {
      codec: 'avc',
      bitrate: outputSettings.bitrate,
    });
    mediaOutput.addVideoTrack(source, {
      frameRate: outputSettings.fps,
      bitrate: outputSettings.bitrate,
      maximumPacketCount: frameCount,
    });
    if (signal.aborted) throw abortError();
    await mediaOutput.start();
    onProgress(0);
    const updateEvery = Math.max(1, Math.floor(frameCount / 100));
    for (let frame = 0; frame < frameCount; frame++) {
      if (signal.aborted) throw abortError();
      renderer.render(frameCount === 1 ? 0 : frame / (frameCount - 1), motion);
      await source.add(frame / outputSettings.fps, 1 / outputSettings.fps);
      if ((frame + 1) % updateEvery === 0 || frame + 1 === frameCount) {
        onProgress((frame + 1) / frameCount);
      }
      if ((frame + 1) % 30 === 0) {
        await yieldToMainThread();
        if (signal.aborted) throw abortError();
      }
    }
    source.close();
    await mediaOutput.finalize();
    if (signal.aborted) throw abortError();
    if (!target.buffer) throw new Error('MP4_EXPORT_FAILED');
    return new Blob([target.buffer], { type: 'video/mp4' });
  } catch (error) {
    const failure = signal.aborted ? abortError() : error;
    try {
      await cancelOutput();
    } catch (cleanupError) {
      if (!signal.aborted) throw new AggregateError([failure, cleanupError], 'MP4_EXPORT_FAILED');
    }
    throw failure;
  } finally {
    signal.removeEventListener('abort', onAbort);
    source?.close();
    renderer?.dispose();
    if (canvas) {
      canvas.width = 0;
      canvas.height = 0;
    }
  }
}
