import { HexColor } from '../../../shared/value-objects/hex-color.vo';
import { SeoTitle } from '../../../shared/value-objects/seo-title.vo';
import { SeoDescription } from '../../../shared/value-objects/seo-description.vo';
import {
  HotsiteBranding,
  HotsiteBrandingProps,
  HotsiteSeo,
  HotsiteSeoProps,
} from './hotsite-config.types';

// Split out of hotsite-config.aggregate.ts to keep it under the file-length cap (see
// hotsite-config.types.ts for the full rationale). Private branding/seo <-> VO mapping helpers,
// used only by hotsite-config.aggregate.ts — not re-exported from there, since these were never
// part of the file's public contract.

export function brandingToDomain(b: HotsiteBranding): HotsiteBrandingProps {
  return {
    ...b,
    primaryColor: HexColor.create(b.primaryColor),
    secondaryColor: HexColor.create(b.secondaryColor),
    backgroundColor: HexColor.create(b.backgroundColor),
    textColor: HexColor.create(b.textColor),
    buttonBackgroundColor: b.buttonBackgroundColor
      ? HexColor.create(b.buttonBackgroundColor)
      : undefined,
    buttonTextColor: b.buttonTextColor ? HexColor.create(b.buttonTextColor) : undefined,
  };
}

export function brandingReconstitute(b: HotsiteBranding): HotsiteBrandingProps {
  return {
    ...b,
    primaryColor: HexColor.reconstitute(b.primaryColor),
    secondaryColor: HexColor.reconstitute(b.secondaryColor),
    backgroundColor: HexColor.reconstitute(b.backgroundColor),
    textColor: HexColor.reconstitute(b.textColor),
    buttonBackgroundColor: b.buttonBackgroundColor
      ? HexColor.reconstitute(b.buttonBackgroundColor)
      : undefined,
    buttonTextColor: b.buttonTextColor ? HexColor.reconstitute(b.buttonTextColor) : undefined,
  };
}

export function brandingFromDomain(b: HotsiteBrandingProps): HotsiteBranding {
  return {
    ...b,
    primaryColor: b.primaryColor.value,
    secondaryColor: b.secondaryColor.value,
    backgroundColor: b.backgroundColor.value,
    textColor: b.textColor.value,
    buttonBackgroundColor: b.buttonBackgroundColor?.value,
    buttonTextColor: b.buttonTextColor?.value,
  };
}

export function seoToDomain(seo: HotsiteSeo): HotsiteSeoProps {
  return {
    title: seo.title !== null ? SeoTitle.create(seo.title) : null,
    description: seo.description !== null ? SeoDescription.create(seo.description) : null,
    ogImageUrl: seo.ogImageUrl,
  };
}

export function seoReconstitute(seo: HotsiteSeo): HotsiteSeoProps {
  return {
    title: seo.title !== null ? SeoTitle.reconstitute(seo.title) : null,
    description: seo.description !== null ? SeoDescription.reconstitute(seo.description) : null,
    // Defaulted, not trusted as always-present: existing rows persisted before this field existed
    // store a `seo` JSONB blob with no `ogImageUrl` key at all — reading one back gives `undefined`
    // at runtime despite the type saying `string` (no migration backfilled old rows; see M18-S03).
    ogImageUrl: seo.ogImageUrl ?? '',
  };
}

export function seoFromDomain(seo: HotsiteSeoProps): HotsiteSeo {
  return {
    title: seo.title?.value ?? null,
    description: seo.description?.value ?? null,
    ogImageUrl: seo.ogImageUrl,
  };
}

export function seoEquals(a: HotsiteSeo, b: HotsiteSeo): boolean {
  return a.title === b.title && a.description === b.description && a.ogImageUrl === b.ogImageUrl;
}
