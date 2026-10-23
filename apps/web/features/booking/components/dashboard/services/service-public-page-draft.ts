import type { ServicePublicProfileItem } from '@ikaro/types';

// The Página pública tab edits a service's public profile as plain strings (an empty string is an
// empty field, an empty gallery slot is an image not yet uploaded). The request wants the stored
// shape — null for "nothing", no blank rows — so the two conversions live here, in one place.
export interface PublicPageDraft {
  readonly coverImageUrl: string;
  readonly galleryImageUrls: readonly string[];
  readonly longDescription: string;
  readonly inclusions: readonly string[];
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
    inclusions: profile.inclusions,
    preparationNotes: profile.preparationNotes ?? '',
  };
}

function nullIfBlank(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

// What a save sends: blank text becomes null, blank inclusions and empty gallery slots are dropped.
export function toPublicPageProfileRequest(draft: PublicPageDraft): ServicePublicProfileItem {
  return {
    coverImageUrl: nullIfBlank(draft.coverImageUrl),
    galleryImageUrls: draft.galleryImageUrls.filter((url) => url !== ''),
    longDescription: nullIfBlank(draft.longDescription),
    inclusions: draft.inclusions.map((item) => item.trim()).filter((item) => item !== ''),
    preparationNotes: nullIfBlank(draft.preparationNotes),
  };
}
