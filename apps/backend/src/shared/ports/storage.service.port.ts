export const STORAGE_SERVICE = Symbol('IStorageService');

export interface GenerateSignedUrlResult {
  signedUrl: string;
  expiresAt: Date;
}

export interface IStorageService {
  /**
   * `bucket` decides the signed URL's destination — it's cryptographically bound to a
   * specific bucket+path and cannot be redirected later. Defaults to the private bucket;
   * pass `'public'` for assets that must resolve via `getPublicUrl()` (e.g. hotsite images).
   * `contentType` is bound into the signature — must match the `Content-Type` header the
   * client uses on the actual upload, or GCS rejects the request.
   */
  generateWriteSignedUrl(
    storagePath: string,
    contentType: string,
    bucket?: 'private' | 'public',
  ): Promise<GenerateSignedUrlResult>;
  /** `bucket` defaults to private — pass `'public'` for assets that must resolve via `getPublicUrl()`. */
  generateReadSignedUrl(
    storagePath: string,
    bucket?: 'private' | 'public',
  ): Promise<GenerateSignedUrlResult>;
  /** `bucket` defaults to private — pass `'public'` to check the hotsite public bucket. */
  exists(storagePath: string, bucket?: 'private' | 'public'): Promise<boolean>;
  /** Pure string template against the public bucket — no GCS API round-trip, no expiry. */
  getPublicUrl(storagePath: string): string;
  /** Copies an object from the private bucket into the public bucket. */
  copy(sourcePath: string, destinationPath: string): Promise<void>;
  /** `bucket` defaults to private — pass `'public'` to delete from the hotsite public bucket. */
  delete(storagePath: string, bucket?: 'private' | 'public'): Promise<void>;
}
