import { ALLOWED_IMAGE_CONTENT_TYPES, type ImageContentType } from '@ikaro/types';

export const MAX_DIMENSION = 1600;
export const WEBP_QUALITY = 0.8;
export const OUTPUT_CONTENT_TYPE: ImageContentType = 'image/webp';

const ALLOWED_SOURCE_TYPES: ReadonlySet<string> = new Set(ALLOWED_IMAGE_CONTENT_TYPES);

function scaledDimensions(
  width: number,
  height: number,
  maxDimension: number,
): { width: number; height: number } {
  if (width <= maxDimension && height <= maxDimension) return { width, height };
  const scale = maxDimension / Math.max(width, height);
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

interface CropRect {
  sx: number;
  sy: number;
  sWidth: number;
  sHeight: number;
}

// Deterministic, no user interaction — crops around the image's own center to the target ratio.
// Wider-than-target sources lose left/right; taller-than-target sources lose top/bottom.
function centerCropRect(width: number, height: number, targetAspectRatio: number): CropRect {
  const currentRatio = width / height;
  if (currentRatio > targetAspectRatio) {
    const sWidth = Math.round(height * targetAspectRatio);
    return { sx: Math.round((width - sWidth) / 2), sy: 0, sWidth, sHeight: height };
  }
  const sHeight = Math.round(width / targetAspectRatio);
  return { sx: 0, sy: Math.round((height - sHeight) / 2), sWidth: width, sHeight };
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
// photos with no visible quality loss. Fail-open: an unsupported API, a thrown error, or (when no
// targetAspectRatio is requested) a "compressed" result that isn't actually smaller/WebP returns
// the original file untouched rather than blocking the upload.
//
// `targetAspectRatio` (e.g. 1 for a square logo, 1200/630 for a landscape share image) center-crops
// the source to that ratio before scaling — deterministic, no user interaction (see M18-S03: an
// interactive drag/zoom cropper was deliberately not introduced). When set, the cropped result is
// always used regardless of size/encoded-type, since the whole point is guaranteeing the shape —
// falling back to the original, wrong-shaped file would defeat the crop entirely.
//
// Only ever attempts a source file already in the upload allowlist — createImageBitmap happily
// decodes formats outside it (GIF, AVIF, SVG, ...), and re-encoding one to WebP would launder an
// otherwise-rejected format past uploadFileToSignedUrl's content-type check. The allowlist
// decision belongs to the original file's type, never to whatever this function produces.
export async function compressImage(file: File, targetAspectRatio?: number): Promise<File> {
  if (!ALLOWED_SOURCE_TYPES.has(file.type)) return file;
  if (typeof createImageBitmap !== 'function') return file;

  let bitmap: ImageBitmap | undefined;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const crop = targetAspectRatio
      ? centerCropRect(bitmap.width, bitmap.height, targetAspectRatio)
      : { sx: 0, sy: 0, sWidth: bitmap.width, sHeight: bitmap.height };
    const { width, height } = scaledDimensions(crop.sWidth, crop.sHeight, MAX_DIMENSION);

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;

    ctx.drawImage(bitmap, crop.sx, crop.sy, crop.sWidth, crop.sHeight, 0, 0, width, height);

    const blob = await toBlob(canvas);
    if (!blob) return file;
    if (!targetAspectRatio && (blob.type !== OUTPUT_CONTENT_TYPE || blob.size >= file.size)) {
      return file;
    }

    const extension =
      blob.type === 'image/png' ? 'png' : blob.type === 'image/webp' ? 'webp' : 'jpg';
    return new File([blob], withExtension(file.name, extension), { type: blob.type });
  } catch {
    return file;
  } finally {
    bitmap?.close();
  }
}
