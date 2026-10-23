import { describe, expect, it } from 'vitest';
import type {
  HotsiteBrandingResponse,
  HotsiteModuleResponse,
  HotsiteSeoResponse,
} from '@ikaro/types';
import { HOTSITE_IMAGE_SLOT_CASES } from '@ikaro/types/testing/hotsite-module-contract';
import { collectHotsiteImagePaths } from './map-hotsite-image-fields';
import { resolveDraftImageUrls } from './resolve-draft-image-urls';
import { stripResolvedImageUrls } from './strip-resolved-image-urls';

// The web mirrors of the backend walkers (HotsiteImagePathsService.collect/mapPaths and
// HotsiteImageUrlResolver) — the backend runs this same table in
// hotsite-image-walkers.parity.spec.ts. A slot a mirror misses is never stripped back to a raw
// path on save, or never resolved to a URL for the unsaved preview.
const TENANT_ID = 't1';
const BASE_URL = 'https://cdn.test/bucket';

const branding: HotsiteBrandingResponse = {
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
};
const seo: HotsiteSeoResponse = { title: null, description: null, ogImageUrl: '' };

describe.each(HOTSITE_IMAGE_SLOT_CASES)('web image walkers: $name', ({ module, paths }) => {
  const layout = [module] as unknown as HotsiteModuleResponse[];

  it('collectHotsiteImagePaths reports exactly the slot paths', () => {
    expect(collectHotsiteImagePaths(branding, layout, seo)).toEqual(paths);
  });

  it('resolveDraftImageUrls resolves every slot, and nothing else', () => {
    const resolved = resolveDraftImageUrls(branding, layout, seo, BASE_URL);

    expect(collectHotsiteImagePaths(branding, resolved.layout, seo)).toEqual(
      paths.map((path) => `${BASE_URL}/${path}`),
    );
  });

  it('stripResolvedImageUrls turns every resolved slot back into its raw path (round trip)', () => {
    const resolved = resolveDraftImageUrls(branding, layout, seo, BASE_URL);

    const stripped = stripResolvedImageUrls(branding, resolved.layout, seo, TENANT_ID);

    expect(collectHotsiteImagePaths(branding, stripped.layout, seo)).toEqual(paths);
    expect(stripped.layout[0].type).toBe(module.type);
  });
});

describe('web image walkers: presentation without a background', () => {
  it('keeps the presentation object untouched and adds no background key', () => {
    const presentation = { surface: 'primary', overlay: { type: 'none' } };
    const layout = [
      {
        type: 'ABOUT',
        enabled: true,
        data: { title: 'T', body: 'B', imagePosition: 'left' },
        presentation,
      },
    ] as unknown as HotsiteModuleResponse[];

    const resolved = resolveDraftImageUrls(branding, layout, seo, BASE_URL);

    expect(resolved.layout[0].presentation).toEqual(presentation);
  });

  it('leaves a module with no presentation without a presentation key', () => {
    const layout = [
      { type: 'ABOUT', enabled: true, data: { title: 'T', body: 'B', imagePosition: 'left' } },
    ] as unknown as HotsiteModuleResponse[];

    const resolved = resolveDraftImageUrls(branding, layout, seo, BASE_URL);

    expect('presentation' in resolved.layout[0]).toBe(false);
  });
});
