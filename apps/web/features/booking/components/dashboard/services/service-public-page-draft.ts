import type { ServicePublicProfileItem } from '@ikaro/types';
import { extractRawStoragePath } from '@/features/platform/hotsite/strip-resolved-image-urls';

// One "what is included" row. The id keeps the row's identity while the manager adds, edits and
// removes rows (the text alone is neither unique nor stable, and the position changes).
export interface InclusionDraft {
  readonly id: string;
  readonly text: string;
}

let inclusionSequence = 0;

export function newInclusionDraft(text = ''): InclusionDraft {
  inclusionSequence += 1;
  return { id: `inclusion-${inclusionSequence}`, text };
}

// The Página pública tab edits a service's public profile as plain strings (an empty string is an
// empty field, an empty gallery slot is an image not yet uploaded). The request wants the stored
// shape — null for "nothing", no blank rows — so the two conversions live here, in one place.
export interface PublicPageDraft {
  readonly coverImageUrl: string;
  readonly galleryImageUrls: readonly string[];
  readonly longDescription: string;
  readonly inclusions: readonly InclusionDraft[];
  readonly preparationNotes: string;
}

export const EMPTY_PUBLIC_PAGE_DRAFT: PublicPageDraft = {
  coverImageUrl: '',
  galleryImageUrls: [],
  longDescription: '',
  inclusions: [],
  preparationNotes: '',
};

export function toPublicPageDraft(profile: ServicePublicProfileItem | null): PublicPageDraft {
  if (!profile) return EMPTY_PUBLIC_PAGE_DRAFT;
  return {
    coverImageUrl: profile.coverImageUrl ?? '',
    galleryImageUrls: profile.galleryImageUrls,
    longDescription: profile.longDescription ?? '',
    inclusions: profile.inclusions.map((text) => newInclusionDraft(text)),
    preparationNotes: profile.preparationNotes ?? '',
  };
}

function nullIfBlank(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

// What a save sends: blank text becomes null, blank inclusions and empty gallery slots are dropped.
// The backend returns a saved image as a full public URL but accepts only its storage path, so each
// image is recovered to `tenants/<tenantId>/…` here; a fresh `tmp/` upload has no such segment and
// passes through unchanged (docs/API_CONTRACTS.md § Base Standards, "Stored objects").
export function toPublicPageProfileRequest(
  draft: PublicPageDraft,
  tenantId: string,
): ServicePublicProfileItem {
  const toPath = (url: string): string => extractRawStoragePath(url, tenantId);
  const cover = nullIfBlank(draft.coverImageUrl);
  return {
    coverImageUrl: cover === null ? null : toPath(cover),
    galleryImageUrls: draft.galleryImageUrls.filter((url) => url !== '').map(toPath),
    longDescription: nullIfBlank(draft.longDescription),
    inclusions: draft.inclusions.map((item) => item.text.trim()).filter((text) => text !== ''),
    preparationNotes: nullIfBlank(draft.preparationNotes),
  };
}
