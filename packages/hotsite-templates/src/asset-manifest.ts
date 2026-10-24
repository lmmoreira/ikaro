import { HOTSITE_TEMPLATE_ASSET_PREFIX } from '@ikaro/types';
import assetManifestJson from '../asset-manifest.json';
import { AssetManifest } from './types';

export const ASSET_MANIFEST: AssetManifest = assetManifestJson;

export const CATALOGUE_ASSET_PREFIX = HOTSITE_TEMPLATE_ASSET_PREFIX;

const REGISTERED_PATHS: ReadonlySet<string> = new Set(Object.keys(ASSET_MANIFEST.assets));

/**
 * True only for an exact path that a released catalogue version registered. Deliberately not a
 * prefix test: a `shared/` wildcard would let a tenant reference any object under it.
 */
export function isRegisteredCatalogueAssetPath(path: string): boolean {
  return REGISTERED_PATHS.has(path);
}

export function listRegisteredCatalogueAssetPaths(): string[] {
  return [...REGISTERED_PATHS];
}
