import { describe, expect, it } from 'vitest';
import type { HotsiteBrandingResponse, HotsiteModuleResponse } from '@ikaro/types';
import { resolveDraftImageUrls } from './resolve-draft-image-urls';

const BASE_URL = 'http://localhost:4443/ikaro-local-public';
const TENANT_ID = '01234567-0000-7000-8000-000000000001';
const RAW_LOGO_PATH = `tenants/${TENANT_ID}/hotsite/branding/abc/logo.png`;

function makeBranding(overrides: Partial<HotsiteBrandingResponse> = {}): HotsiteBrandingResponse {
  return {
    primaryColor: '#2563eb',
    secondaryColor: '#eff6ff',
    backgroundColor: '#ffffff',
    textColor: '#111827',
    headingFontFamily: 'Inter',
    bodyFontFamily: 'Inter',
    logoUrl: '',
    borderRadius: 'rounded',
    buttonStyle: 'filled',
    spacing: 'comfortable',
    shadowStyle: 'subtle',
    ...overrides,
  };
}

describe('resolveDraftImageUrls', () => {
  it('resolves a freshly-uploaded raw storage path into an absolute URL', () => {
    const result = resolveDraftImageUrls(makeBranding({ logoUrl: RAW_LOGO_PATH }), [], BASE_URL);

    expect(result.branding.logoUrl).toBe(`${BASE_URL}/${RAW_LOGO_PATH}`);
  });

  it('leaves an already-resolved absolute URL unchanged', () => {
    const resolvedUrl = `${BASE_URL}/${RAW_LOGO_PATH}`;
    const result = resolveDraftImageUrls(makeBranding({ logoUrl: resolvedUrl }), [], BASE_URL);

    expect(result.branding.logoUrl).toBe(resolvedUrl);
  });

  it('leaves an empty logoUrl unchanged', () => {
    const result = resolveDraftImageUrls(makeBranding({ logoUrl: '' }), [], BASE_URL);

    expect(result.branding.logoUrl).toBe('');
  });

  it('resolves a freshly-uploaded HERO backgroundImageUrl (the exact bug reported: next/image "Failed to parse src")', () => {
    const rawPath = `tenants/${TENANT_ID}/hotsite/hero/abc/bg.png`;
    const modules: HotsiteModuleResponse[] = [
      { type: 'HERO', enabled: true, data: { backgroundImageUrl: rawPath } },
    ];

    const result = resolveDraftImageUrls(makeBranding(), modules, BASE_URL);

    expect(result.layout[0].data.backgroundImageUrl).toBe(`${BASE_URL}/${rawPath}`);
  });

  it('resolves raw paths inside GALLERY images array', () => {
    const rawPath = `tenants/${TENANT_ID}/hotsite/gallery/abc/photo.jpg`;
    const modules: HotsiteModuleResponse[] = [
      { type: 'GALLERY', enabled: true, data: { images: [{ url: rawPath, source: 'upload' }] } },
    ];

    const result = resolveDraftImageUrls(makeBranding(), modules, BASE_URL);

    expect((result.layout[0].data.images as Array<{ url: string }>)[0].url).toBe(
      `${BASE_URL}/${rawPath}`,
    );
  });

  it('resolves raw avatarUrl inside TESTIMONIALS items array', () => {
    const rawPath = `tenants/${TENANT_ID}/hotsite/testimonials/abc/avatar.jpg`;
    const modules: HotsiteModuleResponse[] = [
      {
        type: 'TESTIMONIALS',
        enabled: true,
        data: { items: [{ authorName: 'Maria', text: 'Ótimo!', avatarUrl: rawPath }] },
      },
    ];

    const result = resolveDraftImageUrls(makeBranding(), modules, BASE_URL);

    expect((result.layout[0].data.items as Array<{ avatarUrl: string }>)[0].avatarUrl).toBe(
      `${BASE_URL}/${rawPath}`,
    );
  });

  it('resolves a tmp/ (not-yet-promoted) logoUrl via tmpSignedUrls instead of the public base URL', () => {
    const tmpPath = 'tmp/tenant-1/branding/u1/logo.png';
    const tmpSignedUrls = new Map([[tmpPath, 'https://storage.example.com/signed-read?sig=abc']]);

    const result = resolveDraftImageUrls(
      makeBranding({ logoUrl: tmpPath }),
      [],
      BASE_URL,
      tmpSignedUrls,
    );

    expect(result.branding.logoUrl).toBe('https://storage.example.com/signed-read?sig=abc');
  });

  it('resolves a tmp/ logoUrl to an empty string when no entry exists yet in tmpSignedUrls (loading)', () => {
    const result = resolveDraftImageUrls(
      makeBranding({ logoUrl: 'tmp/tenant-1/branding/u1/logo.png' }),
      [],
      BASE_URL,
    );

    expect(result.branding.logoUrl).toBe('');
  });

  it('leaves a module with no image fields unchanged', () => {
    const modules: HotsiteModuleResponse[] = [
      {
        type: 'SERVICE_LIST',
        enabled: true,
        data: { showPrices: true, showPoints: true, layout: 'grid' },
      },
    ];

    const result = resolveDraftImageUrls(makeBranding(), modules, BASE_URL);

    expect(result.layout[0].data).toEqual(modules[0].data);
  });
});
