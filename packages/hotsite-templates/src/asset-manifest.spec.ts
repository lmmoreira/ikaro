import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  ASSET_MANIFEST,
  CATALOGUE_ASSET_PREFIX,
  isRegisteredCatalogueAssetPath,
  listRegisteredCatalogueAssetPaths,
} from './asset-manifest';
import { CATALOGUE_TEMPLATE_IDS, getTemplateDefinition } from './catalogue';

const PACKAGE_ROOT = join(__dirname, '..');
const ASSETS_DIR = join(PACKAGE_ROOT, 'assets');
const KEY_SHAPE = /^shared\/hotsite-templates\/[a-z0-9-]+\/v\d+\/[a-z0-9-]+\.webp$/;

function stringsIn(node: unknown, out: string[] = []): string[] {
  if (typeof node === 'string') out.push(node);
  else if (Array.isArray(node)) node.forEach((item) => stringsIn(item, out));
  else if (typeof node === 'object' && node !== null) {
    Object.values(node).forEach((value) => stringsIn(value, out));
  }
  return out;
}

function filesOnDisk(): string[] {
  const keys: string[] = [];
  for (const templateId of readdirSync(ASSETS_DIR)) {
    for (const version of readdirSync(join(ASSETS_DIR, templateId))) {
      for (const file of readdirSync(join(ASSETS_DIR, templateId, version))) {
        keys.push(`${CATALOGUE_ASSET_PREFIX}${templateId}/${version}/${file}`);
      }
    }
  }
  return keys;
}

function diskPath(key: string): string {
  return join(ASSETS_DIR, key.slice(CATALOGUE_ASSET_PREFIX.length));
}

describe('catalogue asset manifest', () => {
  it('registers every released object under shared/hotsite-templates/<id>/v<n>/<file>.webp', () => {
    for (const key of listRegisteredCatalogueAssetPaths()) {
      expect(key).toMatch(KEY_SHAPE);
    }
  });

  it('matches the files on disk in both directions: no missing file, no orphan file', () => {
    expect(filesOnDisk().sort()).toEqual(listRegisteredCatalogueAssetPaths().sort());
  });

  it('records the real sha256 and size of every file', () => {
    for (const [key, entry] of Object.entries(ASSET_MANIFEST.assets)) {
      const bytes = readFileSync(diskPath(key));

      expect(createHash('sha256').update(bytes).digest('hex')).toBe(entry.sha256);
      expect(statSync(diskPath(key)).size).toBe(entry.size);
    }
  });

  it('keeps every released object within the size budget', () => {
    for (const entry of Object.values(ASSET_MANIFEST.assets)) {
      expect(entry.size).toBeLessThanOrEqual(300 * 1024);
    }
  });

  it('is only ever extended: no version directory is missing from disk', () => {
    for (const key of listRegisteredCatalogueAssetPaths()) {
      expect(existsSync(diskPath(key))).toBe(true);
    }
  });

  describe.each(CATALOGUE_TEMPLATE_IDS)('%s definition', (id) => {
    const definition = getTemplateDefinition(id);
    const imagePaths = stringsIn(definition).filter((text) =>
      text.startsWith(CATALOGUE_ASSET_PREFIX),
    );

    it('references a thumbnail and at least one image, all registered', () => {
      expect(imagePaths).toContain(definition.thumbnail);
      expect(imagePaths.length).toBeGreaterThan(1);
      for (const path of imagePaths) {
        expect(isRegisteredCatalogueAssetPath(path)).toBe(true);
      }
    });

    it('references only its own template folder and leaves no source URL or file path behind', () => {
      for (const path of imagePaths) {
        expect(path.startsWith(`${CATALOGUE_ASSET_PREFIX}${id}/`)).toBe(true);
      }
      const others = stringsIn(definition).filter((text) =>
        /^https?:|\.png|\.jpe?g|\/Users\//.test(text),
      );
      expect(others).toEqual([]);
    });
  });

  describe('isRegisteredCatalogueAssetPath', () => {
    it('accepts an exact registered path', () => {
      expect(isRegisteredCatalogueAssetPath(listRegisteredCatalogueAssetPaths()[0])).toBe(true);
    });

    it('rejects an unregistered path under the shared prefix: there is no prefix wildcard', () => {
      expect(
        isRegisteredCatalogueAssetPath(`${CATALOGUE_ASSET_PREFIX}casa47/v1/missing.webp`),
      ).toBe(false);
      expect(isRegisteredCatalogueAssetPath(CATALOGUE_ASSET_PREFIX)).toBe(false);
    });

    it('rejects a tenant path', () => {
      expect(isRegisteredCatalogueAssetPath('tenants/t/hotsite/hero/a.webp')).toBe(false);
    });
  });
});
