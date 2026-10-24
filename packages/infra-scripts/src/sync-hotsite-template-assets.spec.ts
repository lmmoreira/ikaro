import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import {
  AssetBucket,
  AssetFetcher,
  AssetManifestFile,
  AssetMismatchError,
  CACHE_CONTROL,
  CONTENT_TYPE,
  checkImmutability,
  emulatorSync,
  FetchedAsset,
  ForbiddenError,
  GcsAssetBucket,
  md5Of,
  ObjectMetadata,
  parseCliOptions,
  sha256Of,
  StorageLike,
  syncAssets,
  verifyAssets,
} from './sync-hotsite-template-assets';

/**
 * A bucket that behaves like the real one where it matters here: create-only uploads fail when the
 * object already exists, and `overwriteForbidden` models the deployer identity (objectCreator only)
 * being refused an overwrite.
 */
class FakeBucket implements AssetBucket {
  readonly objects = new Map<string, Buffer>();
  readonly uploads: { key: string; onlyIfAbsent: boolean }[] = [];
  overwriteForbidden = true;

  async getMetadata(key: string): Promise<ObjectMetadata | null> {
    const bytes = this.objects.get(key);
    return bytes === undefined ? null : { md5Hash: md5Of(bytes), size: bytes.length };
  }

  async upload(key: string, bytes: Buffer, options: { onlyIfAbsent: boolean }): Promise<void> {
    this.uploads.push({ key, onlyIfAbsent: options.onlyIfAbsent });
    if (this.objects.has(key)) {
      if (options.onlyIfAbsent) throw new Error(`${key}: precondition failed`);
      if (this.overwriteForbidden) throw new ForbiddenError(`${key}: 403`);
    }
    this.objects.set(key, bytes);
  }
}

const KEY_A = 'shared/hotsite-templates/demo/v1/a.webp';
const KEY_B = 'shared/hotsite-templates/demo/v1/b.webp';
const BYTES_A = Buffer.from('bytes-a');
const BYTES_B = Buffer.from('bytes-b');

describe('sync-hotsite-template-assets', () => {
  let packageDir: string;
  let manifest: AssetManifestFile;

  beforeEach(() => {
    packageDir = mkdtempSync(join(tmpdir(), 'sync-assets-'));
    for (const [key, bytes] of [
      [KEY_A, BYTES_A],
      [KEY_B, BYTES_B],
    ] as const) {
      const file = join(packageDir, 'assets', key.slice('shared/hotsite-templates/'.length));
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, bytes);
    }
    manifest = {
      assets: {
        [KEY_A]: { sha256: sha256Of(BYTES_A), size: BYTES_A.length },
        [KEY_B]: { sha256: sha256Of(BYTES_B), size: BYTES_B.length },
      },
    };
    writeFileSync(join(packageDir, 'asset-manifest.json'), JSON.stringify(manifest));
  });

  afterEach(() => rmSync(packageDir, { recursive: true, force: true }));

  describe('syncAssets', () => {
    it('uploads an absent object create-only (ifGenerationMatch 0)', async () => {
      const bucket = new FakeBucket();

      const result = await syncAssets(bucket, manifest, packageDir);

      expect(result.uploaded).toEqual([KEY_A, KEY_B]);
      expect(bucket.uploads.every((upload) => upload.onlyIfAbsent)).toBe(true);
      expect(bucket.objects.get(KEY_A)).toEqual(BYTES_A);
    });

    it('skips an object that is already there with the same content', async () => {
      const bucket = new FakeBucket();
      bucket.objects.set(KEY_A, BYTES_A);

      const result = await syncAssets(bucket, manifest, packageDir);

      expect(result.skipped).toEqual([KEY_A]);
      expect(result.uploaded).toEqual([KEY_B]);
    });

    it('is a no-op on a second run', async () => {
      const bucket = new FakeBucket();
      await syncAssets(bucket, manifest, packageDir);
      bucket.uploads.length = 0;

      const second = await syncAssets(bucket, manifest, packageDir);

      expect(second.uploaded).toEqual([]);
      expect(second.skipped).toHaveLength(2);
      expect(bucket.uploads).toEqual([]);
    });

    it('fails, naming the new-version rule, when an object exists with different content', async () => {
      const bucket = new FakeBucket();
      bucket.objects.set(KEY_A, Buffer.from('someone changed this'));

      await expect(syncAssets(bucket, manifest, packageDir)).rejects.toThrow(AssetMismatchError);
      await expect(syncAssets(bucket, manifest, packageDir)).rejects.toThrow('new v<n>');
    });

    it('never overwrites the different object it found', async () => {
      const bucket = new FakeBucket();
      const changed = Buffer.from('someone changed this');
      bucket.objects.set(KEY_A, changed);

      await syncAssets(bucket, manifest, packageDir).catch(() => undefined);

      expect(bucket.objects.get(KEY_A)).toBe(changed);
    });

    it('fails before uploading anything when a committed file does not match the manifest', async () => {
      const bucket = new FakeBucket();
      writeFileSync(join(packageDir, 'assets/demo/v1/b.webp'), 'tampered');

      await expect(syncAssets(bucket, manifest, packageDir)).rejects.toThrow(
        'does not match asset-manifest.json',
      );
      expect(bucket.objects.has(KEY_B)).toBe(false);
    });

    it('logs each upload', async () => {
      const lines: string[] = [];

      await syncAssets(new FakeBucket(), manifest, packageDir, (line) => lines.push(line));

      expect(lines).toEqual([`uploaded ${KEY_A}`, `uploaded ${KEY_B}`]);
    });
  });

  describe('verifyAssets', () => {
    const served = (overrides: Partial<FetchedAsset> = {}): AssetFetcher => {
      const bodies = new Map([
        [`https://cdn.test/${KEY_A}`, BYTES_A],
        [`https://cdn.test/${KEY_B}`, BYTES_B],
      ]);
      return async (url) => ({
        status: 200,
        contentType: CONTENT_TYPE,
        cacheControl: CACHE_CONTROL,
        body: bodies.get(url) ?? Buffer.alloc(0),
        ...overrides,
      });
    };

    it('reports nothing when every object is served with the right status, type, cache and hash', async () => {
      expect(await verifyAssets(manifest, 'https://cdn.test', served())).toEqual([]);
    });

    it('reports a missing object', async () => {
      const problems = await verifyAssets(manifest, 'https://cdn.test', served({ status: 404 }));

      expect(problems).toEqual([`${KEY_A}: HTTP 404`, `${KEY_B}: HTTP 404`]);
    });

    it('reports a wrong content type', async () => {
      const problems = await verifyAssets(
        manifest,
        'https://cdn.test',
        served({ contentType: 'image/png' }),
      );

      expect(problems[0]).toContain('content-type image/png');
    });

    it('reports a response that is not immutable', async () => {
      const problems = await verifyAssets(
        manifest,
        'https://cdn.test',
        served({ cacheControl: 'public, max-age=60' }),
      );

      expect(problems[0]).toContain('cache-control public, max-age=60');
    });

    it('reports a body whose hash differs from the manifest', async () => {
      const problems = await verifyAssets(
        manifest,
        'https://cdn.test',
        served({ body: Buffer.from('other') }),
      );

      expect(problems[0]).toContain('content hash differs');
    });
  });

  describe('checkImmutability', () => {
    it('confirms when the overwrite is refused with a 403', async () => {
      const bucket = new FakeBucket();
      bucket.objects.set(KEY_A, BYTES_A);

      expect(await checkImmutability(bucket, manifest, packageDir)).toBe(KEY_A);
    });

    it('tries to overwrite with the object’s own bytes, never different ones', async () => {
      const bucket = new FakeBucket();
      bucket.objects.set(KEY_A, BYTES_A);

      await checkImmutability(bucket, manifest, packageDir);

      expect(bucket.objects.get(KEY_A)).toEqual(BYTES_A);
      expect(bucket.uploads).toEqual([{ key: KEY_A, onlyIfAbsent: false }]);
    });

    it('fails when the deployer was able to overwrite: IAM is too broad', async () => {
      const bucket = new FakeBucket();
      bucket.objects.set(KEY_A, BYTES_A);
      bucket.overwriteForbidden = false;

      await expect(checkImmutability(bucket, manifest, packageDir)).rejects.toThrow(
        'IAM is too broad',
      );
    });

    it('does not pass on an inconclusive failure that is not a 403', async () => {
      const bucket = new FakeBucket();
      bucket.upload = async () => {
        throw new Error('network down');
      };

      await expect(checkImmutability(bucket, manifest, packageDir)).rejects.toThrow('network down');
    });

    it('fails on an empty manifest instead of passing vacuously', async () => {
      await expect(checkImmutability(new FakeBucket(), { assets: {} }, packageDir)).rejects.toThrow(
        'empty',
      );
    });
  });

  describe('GcsAssetBucket and emulatorSync (against a fake storage)', () => {
    class FakeStorage implements StorageLike {
      readonly buckets = new Map<string, Map<string, Buffer>>();
      readonly saves: { key: string; options: Record<string, unknown> }[] = [];
      failSaveWith: (Error & { code?: number }) | undefined;

      bucket(name: string) {
        const objects = this.buckets.get(name) ?? new Map<string, Buffer>();
        return {
          exists: async (): Promise<[boolean]> => [this.buckets.has(name)],
          file: (key: string) => ({
            getMetadata: async (): Promise<[Record<string, unknown>]> => {
              const bytes = objects.get(key);
              if (bytes === undefined) throw Object.assign(new Error('Not Found'), { code: 404 });
              return [{ md5Hash: md5Of(bytes), size: String(bytes.length) }];
            },
            save: async (data: Buffer, options: Record<string, unknown>): Promise<void> => {
              if (this.failSaveWith) throw this.failSaveWith;
              this.saves.push({ key, options });
              objects.set(key, data);
            },
          }),
        };
      }

      async createBucket(name: string): Promise<void> {
        this.buckets.set(name, new Map());
      }
    }

    it('reads metadata, and reports a missing object as null', async () => {
      const storage = new FakeStorage();
      await storage.createBucket('b');
      storage.bucket('b').file(KEY_A);
      await storage.bucket('b').file(KEY_A).save(BYTES_A, {});
      const bucket = new GcsAssetBucket(storage, 'b');

      expect(await bucket.getMetadata(KEY_A)).toEqual({
        md5Hash: md5Of(BYTES_A),
        size: BYTES_A.length,
      });
      expect(await bucket.getMetadata(KEY_B)).toBeNull();
    });

    it('rethrows a metadata failure that is not a 404', async () => {
      const storage = new FakeStorage();
      storage.bucket = () =>
        ({
          exists: async () => [true],
          file: () => ({
            getMetadata: async () => {
              throw Object.assign(new Error('server error'), { code: 500 });
            },
            save: async () => undefined,
          }),
        }) as never;

      await expect(new GcsAssetBucket(storage, 'b').getMetadata(KEY_A)).rejects.toThrow(
        'server error',
      );
    });

    it('uploads with the webp content type, the immutable cache header and the create-only precondition', async () => {
      const storage = new FakeStorage();
      await storage.createBucket('b');
      const bucket = new GcsAssetBucket(storage, 'b');

      await bucket.upload(KEY_A, BYTES_A, { onlyIfAbsent: true });

      expect(storage.saves[0].options).toEqual({
        resumable: false,
        contentType: 'image/webp',
        metadata: { cacheControl: CACHE_CONTROL },
        preconditionOpts: { ifGenerationMatch: 0 },
      });
    });

    it('sets no precondition for an overwrite attempt', async () => {
      const storage = new FakeStorage();
      await storage.createBucket('b');

      await new GcsAssetBucket(storage, 'b').upload(KEY_A, BYTES_A, { onlyIfAbsent: false });

      expect(storage.saves[0].options).not.toHaveProperty('preconditionOpts');
    });

    it('turns a 403 into ForbiddenError and rethrows anything else', async () => {
      const storage = new FakeStorage();
      await storage.createBucket('b');
      const bucket = new GcsAssetBucket(storage, 'b');

      storage.failSaveWith = Object.assign(new Error('denied'), { code: 403 });
      await expect(bucket.upload(KEY_A, BYTES_A, { onlyIfAbsent: false })).rejects.toBeInstanceOf(
        ForbiddenError,
      );

      storage.failSaveWith = Object.assign(new Error('boom'), { code: 500 });
      await expect(bucket.upload(KEY_A, BYTES_A, { onlyIfAbsent: false })).rejects.toThrow('boom');
    });

    it('emulatorSync creates the missing bucket, uploads absent objects and is idempotent', async () => {
      const storage = new FakeStorage();

      const first = await emulatorSync(storage, 'ikaro-local-public', manifest, packageDir);
      const second = await emulatorSync(storage, 'ikaro-local-public', manifest, packageDir);

      expect(first.uploaded).toEqual([KEY_A, KEY_B]);
      expect(second).toEqual({ uploaded: [], skipped: [KEY_A, KEY_B] });
      expect(storage.buckets.has('ikaro-local-public')).toBe(true);
    });

    it('emulatorSync replaces a stale object: the emulator has no IAM and keeps nothing across restarts', async () => {
      const storage = new FakeStorage();
      await storage.createBucket('b');
      await storage.bucket('b').file(KEY_A).save(Buffer.from('stale'), {});

      const result = await emulatorSync(storage, 'b', manifest, packageDir);

      expect(result.uploaded).toContain(KEY_A);
    });
  });

  describe('parseCliOptions', () => {
    it('defaults to sync, reading the bucket from the environment', () => {
      expect(parseCliOptions([], { GCS_PUBLIC_BUCKET_NAME: 'ikaro-public-staging' })).toMatchObject(
        {
          mode: 'sync',
          bucket: 'ikaro-public-staging',
        },
      );
    });

    it.each([
      ['--verify', 'verify'],
      ['--emulator', 'emulator'],
      ['--check-immutability', 'check-immutability'],
    ] as const)('%s selects %s', (flag, mode) => {
      expect(parseCliOptions([flag], {}).mode).toBe(mode);
    });

    it('prefers an explicit --bucket and reads --base-url', () => {
      const options = parseCliOptions(
        ['--bucket', 'explicit', '--base-url', 'http://localhost:4443/b'],
        { GCS_PUBLIC_BUCKET_NAME: 'from-env' },
      );

      expect(options.bucket).toBe('explicit');
      expect(options.publicBaseUrl).toBe('http://localhost:4443/b');
    });

    it('points at the hotsite-templates package by default', () => {
      expect(parseCliOptions([], {}).packageDir).toMatch(/hotsite-templates$/);
    });
  });
});
