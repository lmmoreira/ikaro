import { afterEach, describe, expect, it, vi } from 'vitest';
import { compressImage, MAX_DIMENSION } from './compress-image';

function makeFile(name: string, type: string, size: number): File {
  return new File([new Uint8Array(size)], name, { type });
}

function makeBitmap(
  width: number,
  height: number,
): {
  width: number;
  height: number;
  close: ReturnType<typeof vi.fn>;
} {
  return { width, height, close: vi.fn() };
}

function stubCanvas(options: { blob?: Blob | null; ctx?: unknown | null } = {}): {
  drawImage: ReturnType<typeof vi.fn>;
  widthSet: number[];
  heightSet: number[];
} {
  const drawImage = vi.fn();
  const ctx = options.ctx === undefined ? { drawImage } : options.ctx;
  const widthSet: number[] = [];
  const heightSet: number[] = [];
  const canvas = {
    set width(v: number) {
      widthSet.push(v);
    },
    set height(v: number) {
      heightSet.push(v);
    },
    getContext: vi.fn(() => ctx),
    toBlob: vi.fn((cb: (b: Blob | null) => void) => cb(options.blob ?? null)),
  };
  vi.stubGlobal('document', { createElement: vi.fn(() => canvas) });
  return { drawImage, widthSet, heightSet };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('compressImage', () => {
  it('returns the original file when createImageBitmap is unavailable', async () => {
    const file = makeFile('photo.jpg', 'image/jpeg', 5_000_000);

    const result = await compressImage(file);

    expect(result).toBe(file);
  });

  it('requests EXIF-baked orientation from createImageBitmap', async () => {
    const bitmap = makeBitmap(2000, 3000);
    const createImageBitmap = vi.fn().mockResolvedValue(bitmap);
    vi.stubGlobal('createImageBitmap', createImageBitmap);
    const smallerBlob = new Blob([new Uint8Array(1000)], { type: 'image/webp' });
    stubCanvas({ blob: smallerBlob });
    const file = makeFile('photo.jpg', 'image/jpeg', 5_000_000);

    await compressImage(file);

    expect(createImageBitmap).toHaveBeenCalledWith(file, { imageOrientation: 'from-image' });
  });

  it('scales a portrait image down to MAX_DIMENSION on the longer edge, preserving aspect ratio', async () => {
    const bitmap = makeBitmap(2000, 4000);
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue(bitmap));
    const smallerBlob = new Blob([new Uint8Array(1000)], { type: 'image/webp' });
    const { drawImage, widthSet, heightSet } = stubCanvas({ blob: smallerBlob });
    const file = makeFile('photo.jpg', 'image/jpeg', 5_000_000);

    await compressImage(file);

    expect(widthSet.at(-1)).toBe(MAX_DIMENSION / 2);
    expect(heightSet.at(-1)).toBe(MAX_DIMENSION);
    expect(drawImage).toHaveBeenCalledWith(bitmap, 0, 0, MAX_DIMENSION / 2, MAX_DIMENSION);
  });

  it('leaves dimensions unchanged when the image is already within MAX_DIMENSION', async () => {
    const bitmap = makeBitmap(800, 600);
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue(bitmap));
    const smallerBlob = new Blob([new Uint8Array(1000)], { type: 'image/webp' });
    const { widthSet, heightSet } = stubCanvas({ blob: smallerBlob });
    const file = makeFile('photo.jpg', 'image/jpeg', 500_000);

    await compressImage(file);

    expect(widthSet.at(-1)).toBe(800);
    expect(heightSet.at(-1)).toBe(600);
  });

  it('returns a new WebP File smaller than the original on success', async () => {
    const bitmap = makeBitmap(2000, 1500);
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue(bitmap));
    const smallerBlob = new Blob([new Uint8Array(200_000)], { type: 'image/webp' });
    stubCanvas({ blob: smallerBlob });
    const file = makeFile('phone-photo.jpg', 'image/jpeg', 5_000_000);

    const result = await compressImage(file);

    expect(result).not.toBe(file);
    expect(result.name).toBe('phone-photo.webp');
    expect(result.type).toBe('image/webp');
    expect(result.size).toBe(200_000);
    expect(bitmap.close).toHaveBeenCalled();
  });

  it('falls back to the original file when createImageBitmap throws', async () => {
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn().mockRejectedValue(new Error('unsupported image format')),
    );
    const file = makeFile('photo.jpg', 'image/jpeg', 5_000_000);

    const result = await compressImage(file);

    expect(result).toBe(file);
  });

  it('falls back to the original file when the canvas 2D context is unavailable', async () => {
    const bitmap = makeBitmap(2000, 1500);
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue(bitmap));
    stubCanvas({ ctx: null });
    const file = makeFile('photo.jpg', 'image/jpeg', 5_000_000);

    const result = await compressImage(file);

    expect(result).toBe(file);
    expect(bitmap.close).toHaveBeenCalled();
  });

  it('falls back to the original file when toBlob resolves null', async () => {
    const bitmap = makeBitmap(2000, 1500);
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue(bitmap));
    stubCanvas({ blob: null });
    const file = makeFile('photo.jpg', 'image/jpeg', 5_000_000);

    const result = await compressImage(file);

    expect(result).toBe(file);
  });

  it('falls back to the original file when the browser silently encodes a different format (no WebP support)', async () => {
    const bitmap = makeBitmap(2000, 1500);
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue(bitmap));
    // canvas.toBlob() falls back to image/png per spec when the requested type is unsupported
    const pngBlob = new Blob([new Uint8Array(200_000)], { type: 'image/png' });
    stubCanvas({ blob: pngBlob });
    const file = makeFile('photo.jpg', 'image/jpeg', 5_000_000);

    const result = await compressImage(file);

    expect(result).toBe(file);
  });

  it('falls back to the original file when the compressed result is larger (already-optimized image)', async () => {
    const bitmap = makeBitmap(400, 300);
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue(bitmap));
    const largerBlob = new Blob([new Uint8Array(50_000)], { type: 'image/webp' });
    stubCanvas({ blob: largerBlob });
    const file = makeFile('tiny-optimized.jpg', 'image/jpeg', 10_000);

    const result = await compressImage(file);

    expect(result).toBe(file);
  });
});
