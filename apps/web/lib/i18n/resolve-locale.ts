const FALLBACK_LOCALE = 'pt-BR';

// Segments that are never tenant slugs
const STATIC_SEGMENTS = new Set([
  '_next',
  'api',
  'favicon.ico',
  'robots.txt',
  'sitemap.xml',
  'dashboard',
  'auth',
]);

export function extractSlug(pathname: string): string | null {
  const segment = pathname.split('/').filter(Boolean)[0] ?? null;
  if (!segment || STATIC_SEGMENTS.has(segment)) return null;
  // Reject path-traversal patterns (dots, encoded chars)
  if (/[.%/\\]/.test(segment)) return null;
  return segment;
}

export async function resolveLocale(pathname: string): Promise<string> {
  const slug = extractSlug(pathname);
  if (!slug) return FALLBACK_LOCALE;

  const bffUrl = process.env.NEXT_PUBLIC_BFF_URL;
  if (!bffUrl) return FALLBACK_LOCALE;

  const isDev = process.env.NODE_ENV === 'development';

  try {
    const res = await fetch(`${bffUrl}/platform/manifest/${slug}`, {
      next: { revalidate: isDev ? 0 : 300 },
    });
    if (!res.ok) return FALLBACK_LOCALE;
    const manifest = (await res.json()) as { localization?: { language?: string } };
    return manifest.localization?.language ?? FALLBACK_LOCALE;
  } catch {
    return FALLBACK_LOCALE;
  }
}
