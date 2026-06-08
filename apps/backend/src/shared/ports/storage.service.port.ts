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
   */
  generateSignedUrl(
    storagePath: string,
    contentType: string,
    operation: 'write',
    bucket?: 'private' | 'public',
  ): Promise<GenerateSignedUrlResult>;
  /** `bucket` defaults to private — pass `'public'` to check the hotsite public bucket. */
  exists(storagePath: string, bucket?: 'private' | 'public'): Promise<boolean>;
  /** Pure string template against the public bucket — no GCS API round-trip, no expiry. */
  getPublicUrl(storagePath: string): string;
  /** Copies an object from the private bucket into the public bucket. */
  copy(sourcePath: string, destinationPath: string): Promise<void>;
}
