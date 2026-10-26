import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import type { AssetManifest } from '../src/types';
import { buildTemplateAssets, MAX_BYTES, parseArgs, THUMBNAIL_WIDTH } from './build-assets';

async function png(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: { r: 120, g: 80, b: 40 } },
  })
    .png()
    .toBuffer();
}

describe('build-assets', () => {
  let root: string;
  let source: string;

  beforeEach(async () => {
    root = mkdtempSync(join(tmpdir(), 'hotsite-templates-'));
    source = join(root, 'source');
    mkdirSync(source);
    writeFileSync(join(source, 'hero.png'), await png(2400, 1200));
    writeFileSync(join(source, 'gallery-1.png'), await png(800, 600));
  });

  afterEach(() => rmSync(root, { recursive: true, force: true }));

  function manifest(): AssetManifest {
    return JSON.parse(readFileSync(join(root, 'asset-manifest.json'), 'utf8')) as AssetManifest;
  }

  it('writes WebP files at most 1600 px wide plus a thumbnail, and registers them', async () => {
    const result = await buildTemplateAssets({
      packageRoot: root,
      templateId: 'demo',
      sourceDir: source,
    });

    expect(result.version).toBe(1);
    expect([...result.written].sort()).toEqual([
      'shared/hotsite-templates/demo/v1/gallery-1.webp',
      'shared/hotsite-templates/demo/v1/hero.webp',
      'shared/hotsite-templates/demo/v1/thumbnail.webp',
    ]);
    const hero = await sharp(join(root, 'assets/demo/v1/hero.webp')).metadata();
    const thumbnail = await sharp(join(root, 'assets/demo/v1/thumbnail.webp')).metadata();
    expect(hero.format).toBe('webp');
    expect(hero.width).toBe(1600);
    expect(thumbnail.width).toBe(THUMBNAIL_WIDTH);
    expect(Object.keys(manifest().assets)).toHaveLength(3);
  });

  it('never upscales a smaller source', async () => {
    await buildTemplateAssets({ packageRoot: root, templateId: 'demo', sourceDir: source });

    expect((await sharp(join(root, 'assets/demo/v1/gallery-1.webp')).metadata()).width).toBe(800);
  });

  it('cuts the thumbnail from the named source, falling back to gallery-1 when there is no hero', async () => {
    rmSync(join(source, 'hero.png'));

    const result = await buildTemplateAssets({
      packageRoot: root,
      templateId: 'demo',
      sourceDir: source,
    });

    expect(result.written).toContain('shared/hotsite-templates/demo/v1/thumbnail.webp');
  });

  it('fails when the requested thumbnail source does not exist', async () => {
    await expect(
      buildTemplateAssets({
        packageRoot: root,
        templateId: 'demo',
        sourceDir: source,
        thumbnailFrom: 'missing',
      }),
    ).rejects.toThrow('Thumbnail source "missing"');
  });

  it('records the sha256 and size of each file', async () => {
    await buildTemplateAssets({ packageRoot: root, templateId: 'demo', sourceDir: source });

    const entry = manifest().assets['shared/hotsite-templates/demo/v1/hero.webp'];
    expect(entry.size).toBe(readFileSync(join(root, 'assets/demo/v1/hero.webp')).length);
    expect(entry.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('refuses to write into a released version and leaves the manifest untouched', async () => {
    await buildTemplateAssets({ packageRoot: root, templateId: 'demo', sourceDir: source });
    const before = readFileSync(join(root, 'asset-manifest.json'), 'utf8');

    await expect(
      buildTemplateAssets({ packageRoot: root, templateId: 'demo', sourceDir: source, version: 1 }),
    ).rejects.toThrow('already released');
    expect(readFileSync(join(root, 'asset-manifest.json'), 'utf8')).toBe(before);
  });

  it('defaults to the next unreleased version and keeps every existing entry byte-identical', async () => {
    await buildTemplateAssets({ packageRoot: root, templateId: 'demo', sourceDir: source });
    const v1 = manifest().assets['shared/hotsite-templates/demo/v1/hero.webp'];

    const second = await buildTemplateAssets({
      packageRoot: root,
      templateId: 'demo',
      sourceDir: source,
    });

    expect(second.version).toBe(2);
    expect(manifest().assets['shared/hotsite-templates/demo/v1/hero.webp']).toEqual(v1);
    expect(Object.keys(manifest().assets)).toHaveLength(6);
  });

  it('refuses a version directory that already has files on disk', async () => {
    mkdirSync(join(root, 'assets/demo/v1'), { recursive: true });
    writeFileSync(join(root, 'assets/demo/v1/stray.webp'), 'x');

    await expect(
      buildTemplateAssets({ packageRoot: root, templateId: 'demo', sourceDir: source }),
    ).rejects.toThrow('is not empty');
    expect(existsSync(join(root, 'asset-manifest.json'))).toBe(false);
  });

  it('fails when the source folder has no images', async () => {
    const empty = join(root, 'empty');
    mkdirSync(empty);

    await expect(
      buildTemplateAssets({ packageRoot: root, templateId: 'demo', sourceDir: empty }),
    ).rejects.toThrow('No PNG/JPEG files');
  });

  it('fails with the file name when an image cannot get under the size budget', async () => {
    const noise = Buffer.alloc(1600 * 1600 * 3);
    for (let i = 0; i < noise.length; i += 1) noise[i] = (i * 2654435761) % 251;
    writeFileSync(
      join(source, 'noisy.png'),
      await sharp(noise, { raw: { width: 1600, height: 1600, channels: 3 } })
        .png()
        .toBuffer(),
    );

    await expect(
      buildTemplateAssets({ packageRoot: root, templateId: 'demo', sourceDir: source }),
    ).rejects.toThrow(`noisy.png: cannot get under ${MAX_BYTES} bytes`);
  }, 30_000);

  it('parses --flag value arguments', () => {
    expect(parseArgs(['--template', 'casa47', '--source', '/tmp/x'])).toEqual({
      template: 'casa47',
      source: '/tmp/x',
    });
  });
});
