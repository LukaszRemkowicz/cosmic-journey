import { extractStars } from './detect';
import type { ImageLayer } from './types';

const MAX_FILE_BYTES = 512 * 1024 * 1024;
const MAX_INPUT_PIXELS = 100_000_000;
const MAX_PROCESSING_EDGE = 4096;

type SampleFormat = 'unsigned' | 'float';
type Photometric = 'black-is-zero' | 'white-is-zero' | 'rgb';

type NormalizeOptions = {
  sampleFormat: SampleFormat;
  bitDepth: number;
  photometric: Photometric;
};

type Dimensions = { width: number; height: number };

function fail(code: string): never {
  throw new Error(code);
}

function validateDimensions({ width, height }: Dimensions): void {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0) {
    fail('INVALID_IMAGE');
  }
  if (width * height > MAX_INPUT_PIXELS) fail('TOO_LARGE');
}

function toByte(value: number): number {
  return Number.isFinite(value) ? Math.min(255, Math.max(0, value * 255)) : 0;
}

export function normalizeSamples(
  bands: readonly ArrayLike<number>[],
  width: number,
  height: number,
  options: NormalizeOptions,
): Uint8ClampedArray {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0 ||
      width * height > MAX_INPUT_PIXELS || bands.length < 1 || bands.length > 4 ||
      bands.some((band) => band.length !== width * height)) {
    throw new RangeError('INVALID_SAMPLE_DIMENSIONS');
  }
  if ((options.sampleFormat === 'unsigned' && options.bitDepth !== 8 && options.bitDepth !== 16) ||
      (options.sampleFormat === 'float' && options.bitDepth !== 32)) {
    throw new RangeError('UNSUPPORTED_TIFF');
  }

  const hasAlpha = bands.length === 2 || bands.length === 4;
  const colorBandCount = bands.length === 1 || bands.length === 2 ? 1 : 3;
  if ((options.photometric === 'rgb' && colorBandCount !== 3) ||
      (options.photometric !== 'rgb' && colorBandCount !== 1)) {
    throw new RangeError('UNSUPPORTED_TIFF');
  }

  if (options.sampleFormat === 'float') {
    for (const band of bands) {
      for (let index = 0; index < band.length; index++) {
        const value = band[index];
        if (Number.isFinite(value) && (value < 0 || value > 1)) throw new Error('FLOAT_RANGE_UNSUPPORTED');
      }
    }
  }
  const unsignedMax = 2 ** options.bitDepth - 1;

  const rgba = new Uint8ClampedArray(width * height * 4);
  const colorValue = (band: number, index: number): number => {
    const value = bands[band][index];
    if (!Number.isFinite(value)) return 0;
    if (options.sampleFormat === 'unsigned') return value / unsignedMax * 255;
    return toByte(value);
  };

  const alphaValue = (index: number): number => {
    if (!hasAlpha) return 255;
    const value = bands[bands.length - 1][index];
    if (!Number.isFinite(value)) return 0;
    if (options.sampleFormat === 'unsigned') return value / unsignedMax * 255;
    return toByte(value);
  };

  for (let index = 0, offset = 0; index < width * height; index++, offset += 4) {
    let red = colorValue(0, index);
    let green = colorBandCount === 1 ? red : colorValue(1, index);
    let blue = colorBandCount === 1 ? red : colorValue(2, index);
    if (options.photometric === 'white-is-zero') {
      red = 255 - red;
      green = 255 - green;
      blue = 255 - blue;
    }
    rgba[offset] = red;
    rgba[offset + 1] = green;
    rgba[offset + 2] = blue;
    rgba[offset + 3] = alphaValue(index);
  }
  return rgba;
}

function isTiffExtension(file: File): boolean {
  return /\.tiff?$/i.test(file.name);
}

function hasTiffSignature(bytes: Uint8Array): boolean {
  return bytes.length >= 4 && (
    (bytes[0] === 0x49 && bytes[1] === 0x49 && bytes[2] === 0x2a && bytes[3] === 0x00) ||
    (bytes[0] === 0x4d && bytes[1] === 0x4d && bytes[2] === 0x00 && bytes[3] === 0x2a) ||
    (bytes[0] === 0x49 && bytes[1] === 0x49 && bytes[2] === 0x2b && bytes[3] === 0x00) ||
    (bytes[0] === 0x4d && bytes[1] === 0x4d && bytes[2] === 0x00 && bytes[3] === 0x2b)
  );
}

function parseJpegDimensions(bytes: Uint8Array): Dimensions | undefined {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return undefined;
  const frameMarkers = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
  let offset = 2;
  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) return undefined;
    while (bytes[offset] === 0xff) offset++;
    const marker = bytes[offset++];
    if (marker === 0xda || marker === 0xd9) return undefined;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    const segmentLength = bytes[offset] * 256 + bytes[offset + 1];
    if (segmentLength < 2 || offset + segmentLength > bytes.length) return undefined;
    if (frameMarkers.has(marker)) {
      return {
        height: bytes[offset + 3] * 256 + bytes[offset + 4],
        width: bytes[offset + 5] * 256 + bytes[offset + 6],
      };
    }
    offset += segmentLength;
  }
  return undefined;
}

function parseWebpDimensions(bytes: Uint8Array): Dimensions | undefined {
  if (bytes.length < 30 || String.fromCharCode(...bytes.subarray(0, 4)) !== 'RIFF' ||
      String.fromCharCode(...bytes.subarray(8, 12)) !== 'WEBP') return undefined;
  const chunk = String.fromCharCode(...bytes.subarray(12, 16));
  if (chunk === 'VP8X') {
    return {
      width: 1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16),
      height: 1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16),
    };
  }
  if (chunk === 'VP8 ' && bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a) {
    return {
      width: (bytes[26] | (bytes[27] << 8)) & 0x3fff,
      height: (bytes[28] | (bytes[29] << 8)) & 0x3fff,
    };
  }
  if (chunk === 'VP8L' && bytes[20] === 0x2f) {
    return {
      width: 1 + bytes[21] + ((bytes[22] & 0x3f) << 8),
      height: 1 + ((bytes[22] & 0xc0) >> 6) + (bytes[23] << 2) + ((bytes[24] & 0x0f) << 10),
    };
  }
  return undefined;
}

async function getRasterDimensions(file: File): Promise<Dimensions> {
  const fixedHeader = new Uint8Array(await file.slice(0, 30).arrayBuffer());
  if (fixedHeader.length >= 24 && fixedHeader[0] === 0x89 && fixedHeader[1] === 0x50 &&
      fixedHeader[2] === 0x4e && fixedHeader[3] === 0x47) {
    const view = new DataView(fixedHeader.buffer, fixedHeader.byteOffset, fixedHeader.byteLength);
    return { width: view.getUint32(16), height: view.getUint32(20) };
  }
  const webp = parseWebpDimensions(fixedHeader);
  if (webp) return webp;

  let prefixLength = Math.min(file.size, 64 * 1024);
  while (prefixLength > 0) {
    const prefix = new Uint8Array(await file.slice(0, prefixLength).arrayBuffer());
    const jpeg = parseJpegDimensions(prefix);
    if (jpeg) return jpeg;
    if (prefixLength === file.size) break;
    prefixLength = Math.min(file.size, prefixLength * 2);
  }
  fail('INVALID_IMAGE');
}

function processingDimensions(width: number, height: number): Dimensions {
  const scale = Math.min(1, MAX_PROCESSING_EDGE / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

function makeLayer(
  file: File,
  kind: 'stars' | 'starless',
  width: number,
  height: number,
  originalWidth: number,
  originalHeight: number,
  bitDepth: number,
  pixels: Uint8ClampedArray,
): ImageLayer {
  const extracted = kind === 'stars' ? extractStars(pixels, width, height) : undefined;
  return {
    name: file.name,
    width,
    height,
    originalWidth,
    originalHeight,
    bitDepth,
    pixels,
    stars: extracted?.stars ?? [],
    ...(extracted ? { starOwnership: extracted.ownership } : {}),
  };
}

async function decodeRasterImage(file: File, kind: 'stars' | 'starless'): Promise<ImageLayer> {
  const { width: originalWidth, height: originalHeight } = await getRasterDimensions(file);
  validateDimensions({ width: originalWidth, height: originalHeight });
  const { width, height } = processingDimensions(originalWidth, originalHeight);
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { resizeWidth: width, resizeHeight: height, resizeQuality: 'high' });
  } catch {
    fail('INVALID_IMAGE');
  }
  const canvas = new OffscreenCanvas(width, height);
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) {
    bitmap.close();
    fail('INVALID_IMAGE');
  }
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const pixels = new Uint8ClampedArray(context.getImageData(0, 0, width, height).data);
  return makeLayer(file, kind, width, height, originalWidth, originalHeight, 8, pixels);
}

function numericSamples(value: unknown): number[] {
  if (Array.isArray(value)) return value.map(Number);
  if (ArrayBuffer.isView(value)) return Array.from(value as unknown as ArrayLike<number>, Number);
  if (typeof value === 'number') return [value];
  return [];
}

async function decodeTiff(file: File, kind: 'stars' | 'starless'): Promise<ImageLayer> {
  let tiff;
  try {
    const geotiff = await import('geotiff');
    tiff = await geotiff.fromBlob(file);
  } catch {
    fail('INVALID_IMAGE');
  }

  let image;
  try {
    if (await tiff.getImageCount() !== 1) fail('UNSUPPORTED_TIFF');
    image = await tiff.getImage(0);
  } catch (error) {
    if (error instanceof Error && error.message === 'UNSUPPORTED_TIFF') throw error;
    fail('INVALID_IMAGE');
  }
  const originalWidth = image.getWidth();
  const originalHeight = image.getHeight();
  validateDimensions({ width: originalWidth, height: originalHeight });

  const directory = image.fileDirectory;
  const orientation = await directory.loadValue('Orientation');
  if (orientation !== undefined && orientation !== 1) fail('UNSUPPORTED_TIFF');

  const photometricTag = await directory.loadValue('PhotometricInterpretation');
  const sampleCount = image.getSamplesPerPixel();
  const photometric: Photometric | undefined = photometricTag === 0
    ? 'white-is-zero'
    : photometricTag === 1
      ? 'black-is-zero'
      : photometricTag === 2
        ? 'rgb'
        : undefined;
  const expectedColorSamples = photometric === 'rgb' ? 3 : 1;
  if (!photometric || (sampleCount !== expectedColorSamples && sampleCount !== expectedColorSamples + 1)) {
    fail('UNSUPPORTED_TIFF');
  }

  const extraSamples = numericSamples(await directory.loadValue('ExtraSamples'));
  const hasAlpha = sampleCount === expectedColorSamples + 1;
  if ((hasAlpha && (extraSamples.length !== 1 || extraSamples[0] !== 2)) ||
      (!hasAlpha && extraSamples.length > 0)) {
    fail('UNSUPPORTED_TIFF');
  }

  const bitDepths = Array.from({ length: sampleCount }, (_, sample) => image.getBitsPerSample(sample));
  const sampleFormats = Array.from({ length: sampleCount }, (_, sample) => image.getSampleFormat(sample));
  if (bitDepths.some((bits) => bits !== bitDepths[0]) ||
      sampleFormats.some((format) => format !== sampleFormats[0])) {
    fail('UNSUPPORTED_TIFF');
  }
  const bitDepth = bitDepths[0];
  const sampleFormat = sampleFormats[0] === 1 ? 'unsigned' : sampleFormats[0] === 3 ? 'float' : undefined;
  if (!sampleFormat ||
      (sampleFormat === 'unsigned' && bitDepth !== 8 && bitDepth !== 16) ||
      (sampleFormat === 'float' && bitDepth !== 32)) {
    fail('UNSUPPORTED_TIFF');
  }

  const { width, height } = processingDimensions(originalWidth, originalHeight);
  let rasters;
  try {
    rasters = await image.readRasters({
      interleave: false,
      width,
      height,
      resampleMethod: 'bilinear',
    });
  } catch {
    fail('UNSUPPORTED_TIFF');
  }
  const bands = Array.from({ length: sampleCount }, (_, sample) => rasters[sample] as ArrayLike<number>);
  const pixels = normalizeSamples(bands, width, height, { sampleFormat, bitDepth, photometric });
  return makeLayer(file, kind, width, height, originalWidth, originalHeight, bitDepth, pixels);
}

export async function decodeImage(file: File, kind: 'stars' | 'starless'): Promise<ImageLayer> {
  if (file.size === 0) fail('INVALID_IMAGE');
  if (file.size > MAX_FILE_BYTES) fail('TOO_LARGE');
  const signature = new Uint8Array(await file.slice(0, 4).arrayBuffer());
  return isTiffExtension(file) || hasTiffSignature(signature)
    ? decodeTiff(file, kind)
    : decodeRasterImage(file, kind);
}
