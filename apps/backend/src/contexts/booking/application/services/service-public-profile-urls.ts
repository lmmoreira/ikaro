import { ServicePublicProfileProps } from '../../domain/service-public-profile.vo';

export type ResolveImageUrl = (storagePath: string) => string;

const ABSOLUTE_URL_PATTERN = /^https?:\/\//;

function resolveIfPath(value: string, resolveUrl: ResolveImageUrl): string {
  return ABSOLUTE_URL_PATTERN.test(value) ? value : resolveUrl(value);
}

// The profile stores (and the domain accepts) storage paths only; a response carries the full public
// URL, so no client ever composes one (docs/API_CONTRACTS.md § Base Standards). Applied after the
// repository read, at the response boundary — the cached aggregate and the database stay path-only.
export function resolveServicePublicProfileUrls(
  profile: ServicePublicProfileProps,
  resolveUrl: ResolveImageUrl,
): ServicePublicProfileProps {
  return {
    ...profile,
    coverImageUrl: profile.coverImageUrl && resolveIfPath(profile.coverImageUrl, resolveUrl),
    galleryImageUrls: profile.galleryImageUrls.map((path) => resolveIfPath(path, resolveUrl)),
  };
}
