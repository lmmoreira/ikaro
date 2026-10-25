import { describe, expect, it } from 'vitest';
import {
  EMPTY_PUBLIC_PAGE_DRAFT,
  newInclusionDraft,
  toPublicPageDraft,
  toPublicPageProfileRequest,
} from './service-public-page-draft';

describe('toPublicPageDraft()', () => {
  it('is the empty draft for a service with no profile', () => {
    expect(toPublicPageDraft(null)).toBe(EMPTY_PUBLIC_PAGE_DRAFT);
  });

  it('turns every null into an empty string', () => {
    expect(
      toPublicPageDraft({
        coverImageUrl: null,
        galleryImageUrls: ['g.webp'],
        longDescription: null,
        inclusions: ['Chá'],
        preparationNotes: null,
      }),
    ).toEqual({
      coverImageUrl: '',
      galleryImageUrls: ['g.webp'],
      longDescription: '',
      inclusions: [{ id: expect.any(String), text: 'Chá' }],
      preparationNotes: '',
    });
  });

  it('gives every inclusion row its own id, even for identical texts', () => {
    const draft = toPublicPageDraft({
      coverImageUrl: null,
      galleryImageUrls: [],
      longDescription: null,
      inclusions: ['Chá', 'Chá', 'Toalhas'],
      preparationNotes: null,
    });

    expect(new Set(draft.inclusions.map((item) => item.id)).size).toBe(3);
  });

  it('newInclusionDraft() makes a blank row with a fresh id each time', () => {
    const first = newInclusionDraft();
    const second = newInclusionDraft('Chá');

    expect(first.text).toBe('');
    expect(second.text).toBe('Chá');
    expect(first.id).not.toBe(second.id);
  });
});

const TENANT_ID = '01234567-0000-7000-8000-000000000001';

describe('toPublicPageProfileRequest()', () => {
  it('sends null for blank text and trims what is kept', () => {
    expect(
      toPublicPageProfileRequest(
        {
          coverImageUrl: '  ',
          galleryImageUrls: [],
          longDescription: '  Texto  ',
          inclusions: [],
          preparationNotes: '',
        },
        TENANT_ID,
      ),
    ).toEqual({
      coverImageUrl: null,
      galleryImageUrls: [],
      longDescription: 'Texto',
      inclusions: [],
      preparationNotes: null,
    });
  });

  it('drops empty gallery slots and blank inclusions, keeping order', () => {
    const request = toPublicPageProfileRequest(
      {
        coverImageUrl: 'cover.webp',
        galleryImageUrls: ['g1.webp', '', 'g2.webp'],
        longDescription: '',
        inclusions: ['  Chá ', '', '   ', 'Toalhas'].map((text) => newInclusionDraft(text)),
        preparationNotes: 'Chegue cedo.',
      },
      TENANT_ID,
    );

    expect(request.galleryImageUrls).toEqual(['g1.webp', 'g2.webp']);
    expect(request.inclusions).toEqual(['Chá', 'Toalhas']);
    expect(request.coverImageUrl).toBe('cover.webp');
  });

  it('round-trips a stored profile unchanged', () => {
    const profile = {
      coverImageUrl: 'cover.webp',
      galleryImageUrls: ['g1.webp'],
      longDescription: 'Texto',
      inclusions: ['Chá'],
      preparationNotes: 'Cedo.',
    };

    expect(toPublicPageProfileRequest(toPublicPageDraft(profile), TENANT_ID)).toEqual(profile);
  });

  describe('stored objects (the backend returns full URLs, accepts only paths)', () => {
    const cover = `tenants/${TENANT_ID}/hotsite/service-profile/u1/cover.webp`;
    const gallery = `tenants/${TENANT_ID}/hotsite/service-profile/u2/a.webp`;
    const draftOf = (coverImageUrl: string, galleryImageUrls: string[]) => ({
      coverImageUrl,
      galleryImageUrls,
      longDescription: '',
      inclusions: [],
      preparationNotes: '',
    });

    it('strips resolved cover and gallery URLs back to their tenants/<tenantId>/ paths', () => {
      const request = toPublicPageProfileRequest(
        draftOf(`https://img.example.test/public-bucket/${cover}`, [
          `https://img.example.test/public-bucket/${gallery}`,
        ]),
        TENANT_ID,
      );

      expect(request.coverImageUrl).toBe(cover);
      expect(request.galleryImageUrls).toEqual([gallery]);
    });

    it('leaves a fresh tmp/ upload unchanged and does not drop an untouched image', () => {
      const tmp = `tmp/${TENANT_ID}/service-profile/u3/new.webp`;

      const request = toPublicPageProfileRequest(
        draftOf(tmp, [`https://img.example.test/public-bucket/${gallery}`, tmp]),
        TENANT_ID,
      );

      expect(request.coverImageUrl).toBe(tmp);
      expect(request.galleryImageUrls).toEqual([gallery, tmp]);
    });

    it("never rewrites another tenant's URL into this tenant's prefix", () => {
      const foreign = 'https://img.example.test/public-bucket/tenants/other-tenant/x.webp';

      expect(toPublicPageProfileRequest(draftOf(foreign, []), TENANT_ID).coverImageUrl).toBe(
        foreign,
      );
    });
  });
});
