export type ImageContentType = 'image/jpeg' | 'image/png';

export const DEFAULT_ALLOWED_IMAGE_TYPES: ReadonlySet<string> = new Set<ImageContentType>([
  'image/jpeg',
  'image/png',
]);

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

export type RequestSignedUrl = (
  fileName: string,
  contentType: ImageContentType,
) => Promise<{ readonly signedUrl: string; readonly filePath: string }>;

// Shared upload mechanic behind PhotoUpload.tsx, AfterServicePhotoUpload.tsx, and
// LogoUpload.tsx: validate → request a signed URL (caller-specific — different domains need
// different params) → PUT the file → return the storage path. Deliberately UI-agnostic (no
// i18n, no React) — callers map the two error types to their own copy and upload-status state.
export async function uploadFileToSignedUrl(
  file: File,
  requestSignedUrl: RequestSignedUrl,
  allowedContentTypes: ReadonlySet<string> = DEFAULT_ALLOWED_IMAGE_TYPES,
): Promise<string> {
  if (!allowedContentTypes.has(file.type)) {
    throw new UnsupportedFileTypeError(file.type);
  }

  const contentType = file.type as ImageContentType;
  const { signedUrl, filePath } = await requestSignedUrl(file.name, contentType);

  const res = await fetch(signedUrl, {
    method: 'PUT',
    headers: { 'Content-Type': contentType },
    body: file,
  });
  if (!res.ok) throw new SignedUrlUploadFailedError(res.status);

  return filePath;
}
