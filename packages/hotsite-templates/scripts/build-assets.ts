import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, parse } from 'node:path';
import sharp from 'sharp';
import type { AssetManifest } from '../src/types';

/**
 * Developer tool, never run by CI or a deploy and never talking to a bucket: converts a folder of
 * source art (PNG/JPEG) into the catalogue's WebP files under assets/<id>/v<n>/ and appends the
 * new objects to asset-manifest.json. The deploy pipelines upload the committed files.
 */

export const MAX_WIDTH = 1600;
export const THUMBNAIL_WIDTH = 640;
export const MAX_BYTES = 300 * 1024;
export const THUMBNAIL_NAME = 'thumbnail';
const QUALITY_STEPS = [82, 74, 66, 58, 50, 42, 34] as const;
const SOURCE_FILE = /\.(png|jpe?g)$/i;

export interface BuildAssetsOptions {
  readonly packageRoot: string;
  readonly templateId: string;
  readonly sourceDir: string;
  readonly version?: number;
  /** Source file name (without extension) the picker thumbnail is cut from. Default: hero, else gallery-1. */
  readonly thumbnailFrom?: string;
}

export interface BuildAssetsResult {
  readonly version: number;
  readonly written: readonly string[];
}

function bucketKey(templateId: string, version: number, file: string): string {
  return `shared/hotsite-templates/${templateId}/v${version}/${file}`;
}

function releasedVersions(manifest: AssetManifest, templateId: string): number[] {
  const prefix = `shared/hotsite-templates/${templateId}/v`;
  const versions = Object.keys(manifest.assets)
    .filter((key) => key.startsWith(prefix))
    .map((key) => Number(key.slice(prefix.length).split('/')[0]));
  return [...new Set(versions)];
}

async function encodeWebp(source: Buffer, width: number, name: string): Promise<Buffer> {
  for (const quality of QUALITY_STEPS) {
    const encoded = await sharp(source)
      .resize({ width, withoutEnlargement: true })
      .webp({ quality })
      .toBuffer();
    if (encoded.length <= MAX_BYTES) return encoded;
  }
  throw new Error(`${name}: cannot get under ${MAX_BYTES} bytes at width ${width}`);
}

function sha256(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

export async function buildTemplateAssets(options: BuildAssetsOptions): Promise<BuildAssetsResult> {
  const { packageRoot, templateId, sourceDir } = options;
  const manifestPath = join(packageRoot, 'asset-manifest.json');
  const manifest: AssetManifest = existsSync(manifestPath)
    ? (JSON.parse(readFileSync(manifestPath, 'utf8')) as AssetManifest)
    : { assets: {} };

  const released = releasedVersions(manifest, templateId);
  const version = options.version ?? (released.length > 0 ? Math.max(...released) + 1 : 1);
  if (released.includes(version)) {
    throw new Error(`${templateId} v${version} is already released; ship a new version instead`);
  }

  const sources = readdirSync(sourceDir)
    .filter((file) => SOURCE_FILE.test(file))
    .sort();
  if (sources.length === 0) throw new Error(`No PNG/JPEG files found in ${sourceDir}`);

  const outDir = join(packageRoot, 'assets', templateId, `v${version}`);
  if (existsSync(outDir) && readdirSync(outDir).length > 0) {
    throw new Error(`${outDir} is not empty; a version directory is written once`);
  }
  mkdirSync(outDir, { recursive: true });

  const files = new Map<string, Buffer>();
  for (const file of sources) {
    const name = parse(file).name;
    files.set(
      `${name}.webp`,
      await encodeWebp(readFileSync(join(sourceDir, file)), MAX_WIDTH, file),
    );
  }

  const thumbnailSource =
    options.thumbnailFrom ?? (sources.some((f) => parse(f).name === 'hero') ? 'hero' : 'gallery-1');
  const thumbnailFile = sources.find((file) => parse(file).name === thumbnailSource);
  if (thumbnailFile === undefined) {
    throw new Error(`Thumbnail source "${thumbnailSource}" is not in ${sourceDir}`);
  }
  files.set(
    `${THUMBNAIL_NAME}.webp`,
    await encodeWebp(readFileSync(join(sourceDir, thumbnailFile)), THUMBNAIL_WIDTH, thumbnailFile),
  );

  const assets: Record<string, { sha256: string; size: number }> = { ...manifest.assets };
  const written: string[] = [];
  for (const [file, buffer] of files) {
    writeFileSync(join(outDir, file), buffer);
    const key = bucketKey(templateId, version, file);
    assets[key] = { sha256: sha256(buffer), size: buffer.length };
    written.push(key);
  }

  const sorted = Object.fromEntries(Object.entries(assets).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(manifestPath, `${JSON.stringify({ assets: sorted }, null, 2)}\n`);
  return { version, written };
}

export function parseArgs(argv: readonly string[]): Record<string, string> {
  const args: Record<string, string> = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token.startsWith('--')) {
      args[token.slice(2)] = argv[i + 1] ?? '';
      i += 1;
    }
  }
  return args;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (!args.template || !args.source) {
    throw new Error(
      'Usage: pnpm --filter @ikaro/hotsite-templates build-assets -- --template <id> --source <dir> [--version <n>] [--thumbnail-from <name>]',
    );
  }
  const result = await buildTemplateAssets({
    packageRoot: process.cwd(),
    templateId: args.template,
    sourceDir: args.source,
    version: args.version ? Number(args.version) : undefined,
    thumbnailFrom: args['thumbnail-from'],
  });
  process.stdout.write(`${args.template} v${result.version}: ${result.written.length} files\n`);
}

if (require.main === module) {
  main().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  });
}
