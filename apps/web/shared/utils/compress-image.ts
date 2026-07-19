import type { ImageContentType } from '@ikaro/types';

export const MAX_DIMENSION = 1600;
export const WEBP_QUALITY = 0.8;
export const OUTPUT_CONTENT_TYPE: ImageContentType = 'image/webp';

function scaledDimensions(
  width: number,
  height: number,
  maxDimension: number,
): { width: number; height: number } {
  if (width <= maxDimension && height <= maxDimension) return { width, height };
  const scale = maxDimension / Math.max(width, height);
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

function withExtension(fileName: string, extension: string): string {
  const dot = fileName.lastIndexOf('.');
  const base = dot === -1 ? fileName : fileName.slice(0, dot);
  return `${base}.${extension}`;
}

function toBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, OUTPUT_CONTENT_TYPE, WEBP_QUALITY));
}

// Resizes to MAX_DIMENSION max-dimension WebP before upload — cuts storage/egress ~10x for phone
// photos with no visible quality loss. Fail-open: an unsupported API, a thrown error, or a
// "compressed" result that isn't actually smaller (or isn't actually WebP — canvas.toBlob silently
// falls back to PNG when the browser lacks WebP encoding) returns the original file untouched
// rather than blocking the upload.
export async function compressImage(file: File): Promise<File> {
  if (typeof createImageBitmap !== 'function') return file;

  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const { width, height } = scaledDimensions(bitmap.width, bitmap.height, MAX_DIMENSION);

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      bitmap.close();
      return file;
    }

    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    const blob = await toBlob(canvas);
    if (!blob || blob.type !== OUTPUT_CONTENT_TYPE || blob.size >= file.size) return file;

    return new File([blob], withExtension(file.name, 'webp'), { type: OUTPUT_CONTENT_TYPE });
  } catch {
    return file;
  }
}
