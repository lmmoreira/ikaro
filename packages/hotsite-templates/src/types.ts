import type {
  HotsiteBrandingResponse,
  HotsiteModuleResponse,
  HotsiteTemplateId,
} from '@ikaro/types';

export type TemplateLocale = 'pt-BR' | 'en';

/**
 * A template's presentation branding: everything in a hotsite's branding except the tenant's own
 * identity. The definition JSON is cast to this once, in the loader, and the package tests prove
 * every definition really carries all of it.
 */
export type TemplateBranding = Omit<
  HotsiteBrandingResponse,
  'logoUrl' | 'brandName' | 'brandTagline'
>;

export const TEMPLATE_LOCALES: readonly TemplateLocale[] = ['pt-BR', 'en'];

/**
 * A template's structure: module order, enabled set, variants, presentation and image paths. Every
 * user-visible string leaf is an empty string here — the text lives in the per-locale copy files,
 * keyed `<MODULE_TYPE>.<dotted.path>` (e.g. `HERO.title`, `NAVIGATION.items.0.label`). Tenant
 * identity (brand name, tagline, logo) and SEO are never part of a definition.
 */
export interface TemplateDefinition {
  readonly id: HotsiteTemplateId;
  readonly version: number;
  readonly thumbnail: string;
  readonly branding: Readonly<TemplateBranding>;
  readonly layout: readonly HotsiteModuleResponse[];
}

export type TemplateCopy = Readonly<Record<string, string>>;

/** The only two values a copy string may interpolate: `{{brandName}}` and `{{tagline}}`. */
export interface TemplateIdentity {
  readonly brandName: string;
  readonly tagline: string;
}

export interface AssetManifestEntry {
  readonly sha256: string;
  readonly size: number;
}

/**
 * Append-only index of every released catalogue object, keyed by its bucket path
 * (`shared/hotsite-templates/<id>/v<n>/<file>`). Entries are never removed or changed: a tenant
 * that applied `v1` keeps referencing its `v1` paths after `v2` ships.
 */
export interface AssetManifest {
  readonly assets: Readonly<Record<string, AssetManifestEntry>>;
}

export class TemplateCopyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TemplateCopyError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
