import { decodeImage } from './decode';
import type { ImageLayer } from './types';

type DecodeRequest = {
  id: number;
  file: File;
  kind: 'stars' | 'starless';
};

type DecodeResponse =
  | { id: number; image: ImageLayer }
  | { id: number; error: string };

type WorkerScope = {
  addEventListener(type: 'message', listener: (event: MessageEvent<DecodeRequest>) => void): void;
  postMessage(message: DecodeResponse, transfer?: Transferable[]): void;
};

const worker = globalThis as unknown as WorkerScope;

worker.addEventListener('message', async ({ data }) => {
  try {
    const image = await decodeImage(data.file, data.kind);
    const transfer: Transferable[] = [image.pixels.buffer as ArrayBuffer];
    if (image.starOwnership) transfer.push(image.starOwnership.buffer as ArrayBuffer);
    worker.postMessage({ id: data.id, image }, transfer);
  } catch (error) {
    worker.postMessage({
      id: data.id,
      error: error instanceof Error ? error.message : 'INVALID_IMAGE',
    });
  }
});
