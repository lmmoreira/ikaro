import { ALLOWED_IMAGE_CONTENT_TYPES, type ImageContentType } from '@ikaro/types';

export const MAX_DIMENSION = 1600;
export const WEBP_QUALITY = 0.8;
export const OUTPUT_CONTENT_TYPE: ImageContentType = 'image/webp';

// A distinct, matchable message rather than a typed error class (M18-S04) — callers that need to
// show purpose-specific copy (e.g. SingleImageUploadField's lowResolutionErrorLabel) compare
// against this constant instead of a generic catch-all.
export const LOW_RESOLUTION_ERROR_MESSAGE =
  'Image resolution is too low for this purpose after downscaling';

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

// centerCropRect() rounds its crop rectangle to whole pixels, which only diverges meaningfully
// from targetAspectRatio for a source too small to represent that ratio in integer pixels (e.g. a
// 1x1 source cropped toward 1200/630 stays 1x1 — still a 1:1 result, not 1.9:1). Real photos (the
// expected input) clear this by orders of magnitude. Guards the crop *shape* guarantee itself,
// which is the whole reason targetAspectRatio exists — see compressImage's doc comment.
const ASPECT_RATIO_TOLERANCE = 0.02;

function matchesAspectRatio(width: number, height: number, targetAspectRatio: number): boolean {
  return Math.abs(width / height - targetAspectRatio) / targetAspectRatio <= ASPECT_RATIO_TOLERANCE;
}

// Full-source rect when no crop was requested; otherwise the centered crop toward
// targetAspectRatio — throwing if the source is too small to represent it (see
// matchesAspectRatio's comment).
function resolveCropRect(width: number, height: number, targetAspectRatio?: number): CropRect {
  if (!targetAspectRatio) return { sx: 0, sy: 0, sWidth: width, sHeight: height };
  const crop = centerCropRect(width, height, targetAspectRatio);
  if (!matchesAspectRatio(crop.sWidth, crop.sHeight, targetAspectRatio)) {
    throw new Error('Image is too small to crop to the required shape');
  }
  return crop;
}

// A required crop (targetAspectRatio set) or a minimum-resolution floor (minHeight set) treats
// every failure as fatal instead of silently falling back to the original file — see
// compressImage's doc comment for why. Either one alone is enough to make a failure fatal: a
// failure here means the guarantee the caller asked for can no longer be verified at all, not
// just that the crop/downscale step itself didn't happen.
function hasHardRequirement(
  targetAspectRatio: number | undefined,
  minHeight: number | undefined,
): boolean {
  return targetAspectRatio !== undefined || minHeight !== undefined;
}

function failOpenOrThrow(
  file: File,
  targetAspectRatio: number | undefined,
  minHeight: number | undefined,
  message: string,
): File {
  if (hasHardRequirement(targetAspectRatio, minHeight)) throw new Error(message);
  return file;
}

function rethrowOrFailOpen(
  file: File,
  targetAspectRatio: number | undefined,
  minHeight: number | undefined,
  err: unknown,
): File {
  if (err instanceof Error && err.message === LOW_RESOLUTION_ERROR_MESSAGE) throw err;
  if (hasHardRequirement(targetAspectRatio, minHeight)) {
    throw err instanceof Error ? err : new Error('Failed to process image');
  }
  return file;
}

function extensionForBlobType(blobType: string): string {
  if (blobType === 'image/png') return 'png';
  if (blobType === 'image/webp') return 'webp';
  return 'jpg';
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
// interactive drag/zoom cropper was deliberately not introduced). When set, the crop is a hard
// requirement, not a best-effort one: any failure that would otherwise fall back to the original,
// unprocessed file (unsupported API, a decode/canvas error, a source too small to represent the
// ratio in whole pixels) throws instead. The backend only signs the upload and never re-validates
// pixel dimensions, so silently storing a wrong-shaped file here would mean the page's declared
// og:image/favicon dimensions no longer match what's actually stored (PR #291 review finding).
//
// Only ever attempts a source file already in the upload allowlist — createImageBitmap happily
// decodes formats outside it (GIF, AVIF, SVG, ...), and re-encoding one to WebP would launder an
// otherwise-rejected format past uploadFileToSignedUrl's content-type check. The allowlist
// decision belongs to the original file's type, never to whatever this function produces.
//
// `minHeight` (M18-S04, e.g. 450 for the 'hero' purpose) rejects a source whose *post-scaling*
// stored height would fall below it — checked against scaledDimensions' output, not the raw
// natural bitmap height. MAX_DIMENSION's cap applies to whichever axis is larger, so for a wide
// banner (width > height) the stored height always converges to roughly MAX_DIMENSION /
// sourceAspectRatio regardless of the original upload's resolution — checking the raw natural
// height would not actually guard anything. Always a hard requirement when set, independent of
// targetAspectRatio's own fail-open behavior (see rethrowOrFailOpen).
export async function compressImage(
  file: File,
  targetAspectRatio?: number,
  minHeight?: number,
): Promise<File> {
  if (!ALLOWED_SOURCE_TYPES.has(file.type)) return file;
  if (typeof createImageBitmap !== 'function') {
    return failOpenOrThrow(
      file,
      targetAspectRatio,
      minHeight,
      'Image cropping is not supported in this browser',
    );
  }

  let bitmap: ImageBitmap | undefined;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const crop = resolveCropRect(bitmap.width, bitmap.height, targetAspectRatio);
    const { width, height } = scaledDimensions(crop.sWidth, crop.sHeight, MAX_DIMENSION);
    if (minHeight !== undefined && height < minHeight) {
      throw new Error(LOW_RESOLUTION_ERROR_MESSAGE);
    }

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return failOpenOrThrow(
        file,
        targetAspectRatio,
        minHeight,
        'Canvas rendering is not supported in this browser',
      );
    }

    ctx.drawImage(bitmap, crop.sx, crop.sy, crop.sWidth, crop.sHeight, 0, 0, width, height);

    const blob = await toBlob(canvas);
    if (!blob) {
      return failOpenOrThrow(
        file,
        targetAspectRatio,
        minHeight,
        'Failed to encode the cropped image',
      );
    }
    if (!targetAspectRatio && (blob.type !== OUTPUT_CONTENT_TYPE || blob.size >= file.size)) {
      // Safe even when minHeight was requested: scaledDimensions only ever downscales, so the
      // original file's natural height is always >= the already-passed minHeight check above.
      return file;
    }

    const extension = extensionForBlobType(blob.type);
    return new File([blob], withExtension(file.name, extension), { type: blob.type });
  } catch (err) {
    return rethrowOrFailOpen(file, targetAspectRatio, minHeight, err);
  } finally {
    bitmap?.close();
  }
}

// Reads intrinsic pixel dimensions independently of compressImage's own encode path — decoupled
// on purpose rather than threaded through compressImage's internals, since this only needs the
// source's aspect ratio (for Gallery masonry tile sizing, M18-S06), not an exact pixel match with
// whatever File compressImage ultimately returns. compressImage only ever scales proportionally
// (when no targetAspectRatio is passed) or falls back to the untouched original — either way, the
// ratio computed here is correct. Best-effort: unsupported API or a decode failure returns null,
// which callers already treat as "no dimensions" (same as a pre-existing image with none stored).
async function readImageDimensions(file: File): Promise<{ width: number; height: number } | null> {
  if (typeof createImageBitmap !== 'function') return null;
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const dimensions = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return dimensions;
  } catch {
    return null;
  }
}

// Gallery-only variant (M18-S06): same compression as compressImage, plus the width/height that
// actually match whatever File it returns. compressImage returns the exact same File reference on
// every fail-open path (unsupported type/API, decode/canvas/encode failure, "not actually
// smaller") and only a genuinely new File on success — that reference equality is what tells us
// whether the real pixels are the untouched source (raw bitmap dimensions) or the resized output
// (scaledDimensions). Reporting the wrong one would silently desync GalleryImage.width/height from
// the file actually sitting at GalleryImage.url.
export async function compressImageWithDimensions(
  file: File,
): Promise<{ file: File; width?: number; height?: number }> {
  const [compressed, dimensions] = await Promise.all([
    compressImage(file),
    readImageDimensions(file),
  ]);
  if (!dimensions) return { file: compressed };

  const { width, height } =
    compressed === file
      ? dimensions
      : scaledDimensions(dimensions.width, dimensions.height, MAX_DIMENSION);
  return { file: compressed, width, height };
}
