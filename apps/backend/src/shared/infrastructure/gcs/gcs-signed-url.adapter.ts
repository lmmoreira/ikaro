import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Storage } from '@google-cloud/storage';
import type { AuthClient } from 'google-auth-library';
import { IStorageService, GenerateSignedUrlResult } from '../../ports/storage.service.port';
import { CloudRunGcsV4Signer } from './cloud-run-gcs-v4-signer';
import { CloudRunGcsAuthClient } from './cloud-run-gcs-auth-client';

const SIGNED_URL_TTL_MS = 15 * 60 * 1000;

@Injectable()
export class GcsSignedUrlAdapter implements IStorageService, OnApplicationBootstrap {
  private readonly storage: Storage;
  private readonly bucketName: string;
  private readonly publicBucketName: string;
  private readonly publicBaseUrl: string;
  private readonly emulatorHost: string | undefined;
  private readonly cloudRunSigner: CloudRunGcsV4Signer | undefined;

  constructor(config: ConfigService) {
    this.emulatorHost = config.get<string>('GCS_EMULATOR_HOST');
    this.bucketName = config.get<string>('GCS_BUCKET_NAME') ?? 'ikaro-local';
    this.publicBucketName = config.get<string>('GCS_PUBLIC_BUCKET_NAME') ?? 'ikaro-local-public';
    this.publicBaseUrl =
      config.get<string>('GCS_PUBLIC_BASE_URL') ?? 'https://storage.googleapis.com';

    const storageOptions: Record<string, unknown> = {};
    if (this.emulatorHost) {
      storageOptions['apiEndpoint'] = this.emulatorHost;
      storageOptions['projectId'] = 'ikaro-local';
    }
    const keyFile = config.get<string>('GCS_KEY_FILE');
    if (keyFile) {
      storageOptions['keyFilename'] = keyFile;
    }

    const cloudRunAuthClient =
      !this.emulatorHost && !keyFile && process.env['K_SERVICE']
        ? new CloudRunGcsAuthClient()
        : undefined;
    if (cloudRunAuthClient) {
      storageOptions['authClient'] = cloudRunAuthClient as unknown as AuthClient;
      storageOptions['projectId'] = config.get<string>('GCP_PROJECT');
    }

    this.storage = new Storage(storageOptions);
    this.cloudRunSigner =
      !this.emulatorHost && !keyFile && process.env['K_SERVICE']
        ? new CloudRunGcsV4Signer()
        : undefined;
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

  async generateWriteSignedUrl(
    storagePath: string,
    contentType: string,
    bucket: 'private' | 'public' = 'private',
  ): Promise<GenerateSignedUrlResult> {
    return this.signUrl(storagePath, bucket, { version: 'v4', action: 'write', contentType });
  }

  async generateReadSignedUrl(
    storagePath: string,
    bucket: 'private' | 'public' = 'private',
  ): Promise<GenerateSignedUrlResult> {
    return this.signUrl(storagePath, bucket, { version: 'v4', action: 'read' });
  }

  private async signUrl(
    storagePath: string,
    bucket: 'private' | 'public',
    config: { version: 'v4'; action: 'read' | 'write'; contentType?: string },
  ): Promise<GenerateSignedUrlResult> {
    const expiresAt = new Date(Date.now() + SIGNED_URL_TTL_MS);
    const bucketName = bucket === 'public' ? this.publicBucketName : this.bucketName;

    if (this.cloudRunSigner) {
      const method = config.action === 'write' ? 'PUT' : 'GET';
      const signedUrl = await this.cloudRunSigner.getSignedUrl(
        bucketName,
        storagePath,
        method,
        expiresAt,
        config.contentType,
      );
      return { signedUrl, expiresAt };
    }

    const file = this.storage.bucket(bucketName).file(storagePath);

    const [signedUrl] = await file.getSignedUrl({ ...config, expires: expiresAt });

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

  async copy(
    sourcePath: string,
    destinationPath: string,
    destinationBucket: 'private' | 'public' = 'public',
  ): Promise<void> {
    const destBucketName = destinationBucket === 'public' ? this.publicBucketName : this.bucketName;
    const source = this.storage.bucket(this.bucketName).file(sourcePath);
    const destination = this.storage.bucket(destBucketName).file(destinationPath);
    await source.copy(destination);
  }

  async delete(storagePath: string, bucket: 'private' | 'public' = 'private'): Promise<void> {
    const bucketName = bucket === 'public' ? this.publicBucketName : this.bucketName;
    await this.storage.bucket(bucketName).file(storagePath).delete({ ignoreNotFound: true });
  }
}
