import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { extractSlug, resolveLocale } from './resolve-locale';

describe('extractSlug', () => {
  it('extracts slug from a tenant root path', () => {
    expect(extractSlug('/belo-auto')).toBe('belo-auto');
  });

  it('extracts slug from a nested tenant path', () => {
    expect(extractSlug('/belo-auto/booking')).toBe('belo-auto');
  });

  it('returns null for root path', () => {
    expect(extractSlug('/')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(extractSlug('')).toBeNull();
  });

  it.each(['_next', 'api', 'favicon.ico', 'robots.txt', 'sitemap.xml', 'dashboard', 'auth'])(
    'returns null for static segment "%s"',
    (segment) => {
      expect(extractSlug(`/${segment}/something`)).toBeNull();
    },
  );
});

describe('resolveLocale', () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_BFF_URL = 'http://localhost:3001';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns tenant language from manifest', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ localization: { language: 'en' } }),
      }),
    );

    const locale = await resolveLocale('/us-tenant');
    expect(locale).toBe('en');
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      'http://localhost:3001/platform/manifest/us-tenant',
      expect.objectContaining({ next: { revalidate: 300 } }),
    );
  });

  it('falls back to pt-BR when manifest language is absent', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ localization: {} }) }),
    );

    expect(await resolveLocale('/some-tenant')).toBe('pt-BR');
  });

  it('falls back to pt-BR when fetch returns a non-ok response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 404, json: async () => ({}) }),
    );

    expect(await resolveLocale('/unknown-slug')).toBe('pt-BR');
  });

  it('falls back to pt-BR when fetch throws', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));

    expect(await resolveLocale('/some-tenant')).toBe('pt-BR');
  });

  it('returns pt-BR for static segments without calling fetch', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    expect(await resolveLocale('/dashboard/bookings')).toBe('pt-BR');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns pt-BR for root path without calling fetch', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    expect(await resolveLocale('/')).toBe('pt-BR');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
