import { ALLOWED_IMAGE_CONTENT_TYPES, type ImageContentType } from '@ikaro/types';

export const DEFAULT_ALLOWED_IMAGE_TYPES: ReadonlySet<string> = new Set<ImageContentType>(
  ALLOWED_IMAGE_CONTENT_TYPES,
);

export class UnsupportedFileTypeError extends Error {
  constructor(contentType: string) {
    super(`Unsupported file type: ${contentType}`);
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class SignedUrlUploadFailedError extends Error {
  constructor(status: number) {
    super(`Signed URL upload failed with status ${status}`);
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export type RequestSignedUrl<T extends string = ImageContentType> = (
  fileName: string,
  contentType: T,
) => Promise<{ readonly signedUrl: string; readonly filePath: string }>;

const UPLOAD_TIMEOUT_MS = 30_000;

// Shared upload mechanic behind PhotoUpload.tsx, AfterServicePhotoUpload.tsx, and
// LogoUpload.tsx: validate → request a signed URL (caller-specific — different domains need
// different params) → PUT the file → return the storage path. Deliberately UI-agnostic (no
// i18n, no React) — callers map the two error types to their own copy and upload-status state.
export async function uploadFileToSignedUrl<T extends string = ImageContentType>(
  file: File,
  requestSignedUrl: RequestSignedUrl<T>,
  allowedContentTypes: ReadonlySet<string> = DEFAULT_ALLOWED_IMAGE_TYPES,
): Promise<string> {
  if (!allowedContentTypes.has(file.type)) {
    throw new UnsupportedFileTypeError(file.type);
  }

  const contentType = file.type as T;
  const { signedUrl, filePath } = await requestSignedUrl(file.name, contentType);

  const res = await fetch(signedUrl, {
    method: 'PUT',
    headers: { 'Content-Type': contentType },
    body: file,
    // bffServerFetch defaults every request to an 8s AbortSignal.timeout — this PUT goes
    // straight to cloud storage instead, so it needs its own guard against hanging forever on
    // a stalled connection. Files can legitimately take longer than a typical API call.
    signal: AbortSignal.timeout(UPLOAD_TIMEOUT_MS),
  });
  if (!res.ok) throw new SignedUrlUploadFailedError(res.status);

  return filePath;
}
