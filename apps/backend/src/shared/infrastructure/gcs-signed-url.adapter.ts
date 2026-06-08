import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Storage } from '@google-cloud/storage';
import { IStorageService, GenerateSignedUrlResult } from '../ports/storage.service.port';

const SIGNED_URL_TTL_MS = 15 * 60 * 1000;

@Injectable()
export class GcsSignedUrlAdapter implements IStorageService, OnApplicationBootstrap {
  private readonly storage: Storage;
  private readonly bucketName: string;
  private readonly publicBucketName: string;
  private readonly publicBaseUrl: string;
  private readonly emulatorHost: string | undefined;

  constructor(config: ConfigService) {
    this.emulatorHost = config.get<string>('GCS_EMULATOR_HOST');
    this.bucketName = config.get<string>('GCS_BUCKET_NAME') ?? 'beloauto-local';
    this.publicBucketName = config.get<string>('GCS_PUBLIC_BUCKET_NAME') ?? 'beloauto-local-public';
    this.publicBaseUrl =
      config.get<string>('GCS_PUBLIC_BASE_URL') ?? 'https://storage.googleapis.com';

    const storageOptions: Record<string, unknown> = {};
    if (this.emulatorHost) {
      storageOptions['apiEndpoint'] = this.emulatorHost;
      storageOptions['projectId'] = 'beloauto-local';
    }
    const keyFile = config.get<string>('GCS_KEY_FILE');
    if (keyFile) {
      storageOptions['keyFilename'] = keyFile;
    }

    this.storage = new Storage(storageOptions);
  }

  async onApplicationBootstrap(): Promise<void> {
    if (!this.emulatorHost) return;
    await this.ensureBucketExists(this.bucketName);
    await this.ensureBucketExists(this.publicBucketName);
  }

  private async ensureBucketExists(bucketName: string): Promise<void> {
    const bucket = this.storage.bucket(bucketName);
    const [exists] = await bucket.exists();
    if (!exists) {
      await this.storage.createBucket(bucketName);
    }
  }

  async generateSignedUrl(
    storagePath: string,
    contentType: string,
    _operation: 'write',
    bucket: 'private' | 'public' = 'private',
  ): Promise<GenerateSignedUrlResult> {
    const expiresAt = new Date(Date.now() + SIGNED_URL_TTL_MS);
    const bucketName = bucket === 'public' ? this.publicBucketName : this.bucketName;
    const file = this.storage.bucket(bucketName).file(storagePath);

    const [signedUrl] = await file.getSignedUrl({
      version: 'v4',
      action: 'write',
      expires: expiresAt,
      contentType,
    });

    return { signedUrl, expiresAt };
  }

  async exists(storagePath: string, bucket: 'private' | 'public' = 'private'): Promise<boolean> {
    const bucketName = bucket === 'public' ? this.publicBucketName : this.bucketName;
    const [fileExists] = await this.storage.bucket(bucketName).file(storagePath).exists();
    return fileExists;
  }

  getPublicUrl(storagePath: string): string {
    return `${this.publicBaseUrl}/${this.publicBucketName}/${storagePath}`;
  }

  async copy(sourcePath: string, destinationPath: string): Promise<void> {
    const source = this.storage.bucket(this.bucketName).file(sourcePath);
    const destination = this.storage.bucket(this.publicBucketName).file(destinationPath);
    await source.copy(destination);
  }
}
