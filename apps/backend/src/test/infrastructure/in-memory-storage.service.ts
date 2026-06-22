import { GenerateSignedUrlResult, IStorageService } from '../../shared/ports/storage.service.port';

export class InMemoryStorageService implements IStorageService {
  readonly uploadedPaths: string[] = [];
  readonly readSignedPaths: string[] = [];
  readonly copiedPaths: Array<{ sourcePath: string; destinationPath: string }> = [];
  private readonly existingPaths = new Set<string>();

  async generateSignedUrl(
    storagePath: string,
    contentType: string | undefined,
    operation: 'write' | 'read',
    bucket: 'private' | 'public' = 'private',
  ): Promise<GenerateSignedUrlResult> {
    const bucketName = bucket === 'public' ? 'ikaro-local-public' : 'bucket';
    if (operation === 'read') {
      this.readSignedPaths.push(storagePath);
      return {
        signedUrl: `http://fake-gcs/${bucketName}/${storagePath}?sig=test&op=read`,
        expiresAt: new Date('2099-01-01T00:00:00Z'),
      };
    }
    this.uploadedPaths.push(storagePath);
    return {
      signedUrl: `http://fake-gcs/${bucketName}/${storagePath}?sig=test&contentType=${encodeURIComponent(contentType ?? '')}`,
      expiresAt: new Date('2099-01-01T00:00:00Z'),
    };
  }

  async exists(storagePath: string, _bucket: 'private' | 'public' = 'private'): Promise<boolean> {
    return this.existingPaths.has(storagePath);
  }

  getPublicUrl(storagePath: string): string {
    return `http://fake-public-gcs/ikaro-local-public/${storagePath}`;
  }

  async copy(sourcePath: string, destinationPath: string): Promise<void> {
    this.copiedPaths.push({ sourcePath, destinationPath });
    this.existingPaths.add(destinationPath);
  }

  markAsUploaded(storagePath: string): void {
    this.existingPaths.add(storagePath);
  }
}
