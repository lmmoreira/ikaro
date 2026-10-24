import type { HotsiteTemplateCapability, HotsiteTemplateId } from '@ikaro/types';
import { HotsiteBranding, HotsiteModule } from '../../domain/hotsite-config.aggregate';

export const TEMPLATE_CATALOGUE = Symbol('ITemplateCatalogue');

export type TemplateCatalogueLocale = 'pt-BR' | 'en';

export interface TemplateCatalogueIdentity {
  brandName: string;
  tagline: string;
}

export interface TemplateCatalogueEntry {
  id: HotsiteTemplateId;
  version: number;
  /** Bucket path of the picker thumbnail (`shared/hotsite-templates/<id>/v<n>/thumbnail.webp`). */
  thumbnailPath: string;
  capabilities: HotsiteTemplateCapability[];
}

/**
 * A template with its locale copy merged in and the tenant identity interpolated. Palette and
 * typography only: tenant identity, logo and SEO are never part of a template.
 */
export interface MaterializedTemplate {
  id: HotsiteTemplateId;
  version: number;
  branding: Partial<HotsiteBranding>;
  layout: HotsiteModule[];
}

/**
 * The platform-owned, versioned template catalogue. Read-only and immutable at runtime: a
 * template changes only by shipping a new version, never by being edited in place.
 */
export interface ITemplateCatalogue {
  list(): TemplateCatalogueEntry[];
  /** Null for an id that is not in the catalogue. */
  materialize(
    templateId: string,
    locale: TemplateCatalogueLocale,
    identity: TemplateCatalogueIdentity,
  ): MaterializedTemplate | null;
  /**
   * True only for an exact path registered by a released catalogue version (the append-only
   * asset manifest, not just the current definitions). No prefix wildcard.
   */
  isRegisteredAssetPath(path: string): boolean;
}
