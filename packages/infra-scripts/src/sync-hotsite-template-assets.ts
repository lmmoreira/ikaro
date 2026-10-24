import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { Storage } from '@google-cloud/storage';

/**
 * Makes a bucket match packages/hotsite-templates/asset-manifest.json, and nothing else. It never
 * converts an image (that is the package's developer-only build-assets tool) and keeps no state, so
 * it is safe to run on every deploy.
 *
 *   sync            create the manifest objects that are missing (create-only, never overwrite)
 *   --verify        fetch every manifest path anonymously over its public URL and compare it
 *   --emulator      same as sync, against the local GCS emulator (creates the bucket if missing)
 *   --check-immutability
 *                   prove the deployer identity cannot overwrite a released object: re-uploads one
 *                   object's own bytes and requires a 403. A mistake would change nothing, because
 *                   the bytes are identical.
 *
 * Immutability is enforced by IAM (the deployer holds only a conditional objectCreator grant on the
 * shared/ prefix), not by this tool; the hash check below is the early, readable failure.
 */

export const CACHE_CONTROL = 'public, max-age=31536000, immutable';
export const CONTENT_TYPE = 'image/webp';

export interface ManifestEntry {
  readonly sha256: string;
  readonly size: number;
}

export interface AssetManifestFile {
  readonly assets: Readonly<Record<string, ManifestEntry>>;
}

export interface ObjectMetadata {
  /** Base64 MD5 of the stored bytes, as reported by GCS. */
  readonly md5Hash: string;
  readonly size: number;
}

export class ForbiddenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ForbiddenError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export interface AssetBucket {
  /** Null when the object does not exist. */
  getMetadata(key: string): Promise<ObjectMetadata | null>;
  /** Creates the object; with `onlyIfAbsent` it fails if the object appeared in the meantime. */
  upload(key: string, bytes: Buffer, options: { onlyIfAbsent: boolean }): Promise<void>;
}

export interface SyncResult {
  readonly uploaded: readonly string[];
  readonly skipped: readonly string[];
}

export class AssetMismatchError extends Error {
  constructor(key: string) {
    super(`${key} already exists with different content: a changed image must ship as a new v<n>`);
    this.name = 'AssetMismatchError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export function sha256Of(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

export function md5Of(bytes: Buffer): string {
  return createHash('md5').update(bytes).digest('base64');
}

export function readManifest(packageDir: string): AssetManifestFile {
  return JSON.parse(
    readFileSync(join(packageDir, 'asset-manifest.json'), 'utf8'),
  ) as AssetManifestFile;
}

function localBytes(packageDir: string, key: string, entry: ManifestEntry): Buffer {
  const bytes = readFileSync(
    join(packageDir, 'assets', key.slice('shared/hotsite-templates/'.length)),
  );
  if (sha256Of(bytes) !== entry.sha256 || bytes.length !== entry.size) {
    throw new Error(`${key}: the committed file does not match asset-manifest.json`);
  }
  return bytes;
}

export async function syncAssets(
  bucket: AssetBucket,
  manifest: AssetManifestFile,
  packageDir: string,
  log: (line: string) => void = () => undefined,
): Promise<SyncResult> {
  const uploaded: string[] = [];
  const skipped: string[] = [];
  for (const [key, entry] of Object.entries(manifest.assets)) {
    const bytes = localBytes(packageDir, key, entry);
    const existing = await bucket.getMetadata(key);
    if (existing === null) {
      await bucket.upload(key, bytes, { onlyIfAbsent: true });
      uploaded.push(key);
      log(`uploaded ${key}`);
    } else if (existing.md5Hash === md5Of(bytes) && existing.size === bytes.length) {
      skipped.push(key);
    } else {
      throw new AssetMismatchError(key);
    }
  }
  return { uploaded, skipped };
}

export interface FetchedAsset {
  readonly status: number;
  readonly contentType: string | null;
  readonly cacheControl: string | null;
  readonly body: Buffer;
}

export type AssetFetcher = (url: string) => Promise<FetchedAsset>;

export async function fetchAnonymously(url: string): Promise<FetchedAsset> {
  const response = await fetch(url);
  return {
    status: response.status,
    contentType: response.headers.get('content-type'),
    cacheControl: response.headers.get('cache-control'),
    body: Buffer.from(await response.arrayBuffer()),
  };
}

/** Every problem found, one line each; empty means every released object is served as expected. */
export async function verifyAssets(
  manifest: AssetManifestFile,
  publicBaseUrl: string,
  fetchAsset: AssetFetcher = fetchAnonymously,
): Promise<string[]> {
  const problems: string[] = [];
  for (const [key, entry] of Object.entries(manifest.assets)) {
    const asset = await fetchAsset(`${publicBaseUrl}/${key}`);
    if (asset.status !== 200) problems.push(`${key}: HTTP ${asset.status}`);
    else if (asset.contentType !== CONTENT_TYPE)
      problems.push(`${key}: content-type ${asset.contentType}`);
    else if (!asset.cacheControl?.includes('immutable'))
      problems.push(`${key}: cache-control ${asset.cacheControl}`);
    else if (sha256Of(asset.body) !== entry.sha256)
      problems.push(`${key}: content hash differs from the manifest`);
  }
  return problems;
}

/**
 * Returns normally only when the overwrite is refused with a 403 (ForbiddenError). Any other
 * outcome — success, or a different failure — throws, so a pipeline cannot pass on an inconclusive
 * check.
 */
export async function checkImmutability(
  bucket: AssetBucket,
  manifest: AssetManifestFile,
  packageDir: string,
): Promise<string> {
  const [key, entry] = Object.entries(manifest.assets)[0] ?? [];
  if (key === undefined || entry === undefined) throw new Error('asset-manifest.json is empty');
  const bytes = localBytes(packageDir, key, entry);
  try {
    await bucket.upload(key, bytes, { onlyIfAbsent: false });
  } catch (error) {
    if (error instanceof ForbiddenError) return key;
    throw error;
  }
  throw new Error(`${key}: the deployer was able to overwrite a released object; IAM is too broad`);
}

/** The slice of @google-cloud/storage this tool uses, so it can be exercised without a bucket. */
export interface StorageLike {
  bucket(name: string): {
    exists(): Promise<[boolean, ...unknown[]]>;
    file(key: string): {
      getMetadata(): Promise<[Record<string, unknown>, ...unknown[]]>;
      save(data: Buffer, options: Record<string, unknown>): Promise<unknown>;
    };
  };
  createBucket(name: string): Promise<unknown>;
}

export class GcsAssetBucket implements AssetBucket {
  constructor(
    private readonly storage: StorageLike,
    private readonly bucketName: string,
  ) {}

  async getMetadata(key: string): Promise<ObjectMetadata | null> {
    try {
      const [metadata] = await this.storage.bucket(this.bucketName).file(key).getMetadata();
      return { md5Hash: String(metadata.md5Hash), size: Number(metadata.size) };
    } catch (error) {
      if ((error as { code?: number }).code === 404) return null;
      throw error;
    }
  }

  async upload(key: string, bytes: Buffer, options: { onlyIfAbsent: boolean }): Promise<void> {
    try {
      await this.storage
        .bucket(this.bucketName)
        .file(key)
        .save(bytes, {
          resumable: false,
          contentType: CONTENT_TYPE,
          metadata: { cacheControl: CACHE_CONTROL },
          ...(options.onlyIfAbsent ? { preconditionOpts: { ifGenerationMatch: 0 } } : {}),
        });
    } catch (error) {
      if ((error as { code?: number }).code === 403) {
        throw new ForbiddenError(`${key}: 403 from the bucket`);
      }
      throw error;
    }
  }
}

export interface CliOptions {
  readonly mode: 'sync' | 'verify' | 'emulator' | 'check-immutability';
  readonly bucket: string | undefined;
  readonly packageDir: string;
  readonly publicBaseUrl: string | undefined;
}

export function parseCliOptions(argv: readonly string[], env: NodeJS.ProcessEnv): CliOptions {
  const flags = new Set(argv.filter((arg) => arg.startsWith('--') && !arg.includes('=')));
  const valueOf = (name: string): string | undefined => {
    const index = argv.indexOf(`--${name}`);
    return index === -1 ? undefined : argv[index + 1];
  };
  let mode: CliOptions['mode'] = 'sync';
  if (flags.has('--verify')) mode = 'verify';
  if (flags.has('--emulator')) mode = 'emulator';
  if (flags.has('--check-immutability')) mode = 'check-immutability';
  return {
    mode,
    bucket: valueOf('bucket') ?? env.GCS_PUBLIC_BUCKET_NAME,
    packageDir: resolve(valueOf('package-dir') ?? join(__dirname, '../../hotsite-templates')),
    publicBaseUrl: valueOf('base-url'),
  };
}

async function ensureEmulatorBucket(storage: StorageLike, name: string): Promise<void> {
  const [exists] = await storage.bucket(name).exists();
  if (!exists) await storage.createBucket(name);
}

export async function emulatorSync(
  storage: StorageLike,
  bucketName: string,
  manifest: AssetManifestFile,
  packageDir: string,
): Promise<SyncResult> {
  await ensureEmulatorBucket(storage, bucketName);
  const bucket = new GcsAssetBucket(storage, bucketName);
  const uploaded: string[] = [];
  const skipped: string[] = [];
  for (const [key, entry] of Object.entries(manifest.assets)) {
    const bytes = localBytes(packageDir, key, entry);
    const existing = await bucket.getMetadata(key);
    if (existing?.md5Hash === md5Of(bytes)) {
      skipped.push(key);
    } else {
      // The emulator keeps nothing across restarts and has no IAM, so a stale object can simply be
      // replaced; the deployed buckets never take this branch.
      await bucket.upload(key, bytes, { onlyIfAbsent: false });
      uploaded.push(key);
    }
  }
  return { uploaded, skipped };
}

export async function main(argv: readonly string[], env: NodeJS.ProcessEnv): Promise<void> {
  const options = parseCliOptions(argv, env);
  const manifest = readManifest(options.packageDir);
  const say = (line: string): void => void process.stdout.write(`${line}\n`);

  if (options.mode === 'emulator') {
    // Defaults match apps/backend/.env.example, so `pnpm hotsite-templates:seed` needs no setup.
    const host = env.GCS_EMULATOR_HOST ?? 'http://localhost:4443';
    const bucketName = options.bucket ?? 'ikaro-local-public';
    const apiEndpoint = host.startsWith('http') ? host : `http://${host}`;
    const storage = new Storage({ apiEndpoint, projectId: 'ikaro-local' });
    const result = await emulatorSync(storage, bucketName, manifest, options.packageDir);
    say(`emulator: ${result.uploaded.length} uploaded, ${result.skipped.length} already present`);
    return;
  }

  if (!options.bucket) throw new Error('A bucket is required (--bucket or GCS_PUBLIC_BUCKET_NAME)');

  if (options.mode === 'verify') {
    const baseUrl = options.publicBaseUrl ?? `https://storage.googleapis.com/${options.bucket}`;
    const problems = await verifyAssets(manifest, baseUrl);
    if (problems.length > 0) throw new Error(`verify failed:\n${problems.join('\n')}`);
    say(`verified ${Object.keys(manifest.assets).length} objects over ${baseUrl}`);
    return;
  }

  const bucket = new GcsAssetBucket(new Storage(), options.bucket);
  if (options.mode === 'check-immutability') {
    const key = await checkImmutability(bucket, manifest, options.packageDir);
    say(`immutability confirmed: overwriting ${key} was refused with 403`);
    return;
  }

  const result = await syncAssets(bucket, manifest, options.packageDir, say);
  say(`sync: ${result.uploaded.length} uploaded, ${result.skipped.length} already present`);
}

if (require.main === module) {
  main(process.argv.slice(2), process.env).catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  });
}
