import { ConfigService } from '@nestjs/config';
import { Storage } from '@google-cloud/storage';
import { GcsSignedUrlAdapter } from './gcs-signed-url.adapter';

jest.mock('@google-cloud/storage');

const MockStorage = Storage as jest.MockedClass<typeof Storage>;

describe('GcsSignedUrlAdapter', () => {
  let mockGetSignedUrl: jest.Mock;
  let mockFileExists: jest.Mock;
  let mockBucketExists: jest.Mock;
  let mockCreateBucket: jest.Mock;
  let mockFile: jest.Mock;
  let mockBucket: jest.Mock;

  function makeConfig(overrides: Record<string, string | undefined> = {}): ConfigService {
    return {
      get: jest.fn((key: string) => overrides[key]),
    } as unknown as ConfigService;
  }

  function makeService(configValues: Record<string, string | undefined> = {}): GcsSignedUrlAdapter {
    return new GcsSignedUrlAdapter(makeConfig(configValues));
  }

  beforeEach(() => {
    mockGetSignedUrl = jest
      .fn()
      .mockResolvedValue(['https://storage.googleapis.com/bucket/path?X-Goog-Signature=abc']);
    mockFileExists = jest.fn().mockResolvedValue([true]);
    mockFile = jest
      .fn()
      .mockReturnValue({ getSignedUrl: mockGetSignedUrl, exists: mockFileExists });
    mockBucketExists = jest.fn().mockResolvedValue([true]);
    mockCreateBucket = jest.fn().mockResolvedValue(undefined);
    mockBucket = jest.fn().mockReturnValue({ exists: mockBucketExists, file: mockFile });

    MockStorage.mockImplementation(
      () =>
        ({
          bucket: mockBucket,
          createBucket: mockCreateBucket,
        }) as unknown as Storage,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('configures emulator endpoint and projectId when GCS_EMULATOR_HOST is set', () => {
      makeService({ GCS_EMULATOR_HOST: 'http://localhost:4443' });
      expect(MockStorage).toHaveBeenCalledWith(
        expect.objectContaining({
          apiEndpoint: 'http://localhost:4443',
          projectId: 'ikaro-local',
        }),
      );
    });

    it('sets keyFilename when GCS_KEY_FILE is set', () => {
      makeService({ GCS_KEY_FILE: '/path/to/key.json' });
      expect(MockStorage).toHaveBeenCalledWith(
        expect.objectContaining({ keyFilename: '/path/to/key.json' }),
      );
    });

    it('uses empty storage options when neither emulator nor key file is configured', () => {
      makeService({});
      expect(MockStorage).toHaveBeenCalledWith({});
    });
  });

  describe('onApplicationBootstrap()', () => {
    it('returns early without accessing GCS when no emulator host is configured', async () => {
      const service = makeService({});
      await service.onApplicationBootstrap();
      expect(mockBucket).not.toHaveBeenCalled();
    });

    it('creates bucket when emulator is set and bucket does not exist', async () => {
      mockBucketExists.mockResolvedValue([false]);
      const service = makeService({ GCS_EMULATOR_HOST: 'http://localhost:4443' });
      await service.onApplicationBootstrap();
      expect(mockCreateBucket).toHaveBeenCalledWith('ikaro-local');
    });

    it('does not create bucket when emulator is set and bucket already exists', async () => {
      mockBucketExists.mockResolvedValue([true]);
      const service = makeService({ GCS_EMULATOR_HOST: 'http://localhost:4443' });
      await service.onApplicationBootstrap();
      expect(mockCreateBucket).not.toHaveBeenCalled();
    });
  });

  describe('generateWriteSignedUrl()', () => {
    it('returns the signedUrl and an expiresAt Date', async () => {
      const service = makeService({});
      const result = await service.generateWriteSignedUrl(
        'tenants/t1/uploads/uuid/car.jpg',
        'image/jpeg',
      );
      expect(result.signedUrl).toBe(
        'https://storage.googleapis.com/bucket/path?X-Goog-Signature=abc',
      );
      expect(result.expiresAt).toBeInstanceOf(Date);
    });

    it('calls getSignedUrl with v4, write action and correct contentType', async () => {
      const service = makeService({});
      await service.generateWriteSignedUrl('tenants/t1/uploads/uuid/car.jpg', 'image/png');
      expect(mockGetSignedUrl).toHaveBeenCalledWith(
        expect.objectContaining({ version: 'v4', action: 'write', contentType: 'image/png' }),
      );
    });

    it('passes the correct file path to the storage bucket', async () => {
      const service = makeService({});
      const path = 'tenants/abc/bookings/def/photo.jpg';
      await service.generateWriteSignedUrl(path, 'image/jpeg');
      expect(mockFile).toHaveBeenCalledWith(path);
    });

    it('uses custom bucket name from config', async () => {
      const service = makeService({ GCS_BUCKET_NAME: 'my-prod-bucket' });
      await service.generateWriteSignedUrl('path/file.jpg', 'image/jpeg');
      expect(mockBucket).toHaveBeenCalledWith('my-prod-bucket');
    });

    it('defaults to ikaro-local bucket when GCS_BUCKET_NAME is not set', async () => {
      const service = makeService({});
      await service.generateWriteSignedUrl('path/file.jpg', 'image/jpeg');
      expect(mockBucket).toHaveBeenCalledWith('ikaro-local');
    });

    it('sets expiresAt approximately 15 minutes in the future', async () => {
      const before = Date.now();
      const service = makeService({});
      const result = await service.generateWriteSignedUrl('path/file.jpg', 'image/jpeg');
      const after = Date.now();
      const expiresMs = result.expiresAt.getTime();
      const ttlMs = 15 * 60 * 1000;
      expect(expiresMs).toBeGreaterThanOrEqual(before + ttlMs - 100);
      expect(expiresMs).toBeLessThanOrEqual(after + ttlMs + 100);
    });
  });

  describe('generateReadSignedUrl()', () => {
    it('returns the signedUrl and an expiresAt Date', async () => {
      const service = makeService({});
      const result = await service.generateReadSignedUrl('tenants/t1/bookings/b1/car.jpg');
      expect(result.signedUrl).toBe(
        'https://storage.googleapis.com/bucket/path?X-Goog-Signature=abc',
      );
      expect(result.expiresAt).toBeInstanceOf(Date);
    });

    it('calls getSignedUrl with v4, read action and no contentType', async () => {
      const service = makeService({});
      await service.generateReadSignedUrl('tenants/t1/bookings/b1/car.jpg');
      expect(mockGetSignedUrl).toHaveBeenCalledWith({
        version: 'v4',
        action: 'read',
        expires: expect.any(Date),
      });
    });

    it('passes the correct file path to the storage bucket', async () => {
      const service = makeService({});
      const path = 'tenants/abc/bookings/def/photo.jpg';
      await service.generateReadSignedUrl(path);
      expect(mockFile).toHaveBeenCalledWith(path);
    });

    it('uses the public bucket when bucket is "public"', async () => {
      const service = makeService({});
      await service.generateReadSignedUrl('hotsite/banner.jpg', 'public');
      expect(mockBucket).toHaveBeenCalledWith('ikaro-local-public');
    });
  });

  describe('exists()', () => {
    it('returns true when the file exists in the bucket', async () => {
      mockFileExists.mockResolvedValue([true]);
      const service = makeService({});
      await expect(service.exists('tenants/t1/uploads/uuid/car.jpg')).resolves.toBe(true);
    });

    it('returns false when the file does not exist in the bucket', async () => {
      mockFileExists.mockResolvedValue([false]);
      const service = makeService({});
      await expect(service.exists('tenants/t1/uploads/uuid/missing.jpg')).resolves.toBe(false);
    });

    it('passes the correct file path to the storage bucket', async () => {
      const service = makeService({});
      const path = 'tenants/abc/bookings/def/photo.jpg';
      await service.exists(path);
      expect(mockFile).toHaveBeenCalledWith(path);
    });

    it('uses custom bucket name from config', async () => {
      const service = makeService({ GCS_BUCKET_NAME: 'my-prod-bucket' });
      await service.exists('path/file.jpg');
      expect(mockBucket).toHaveBeenCalledWith('my-prod-bucket');
    });
  });
});
