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

describe('toPublicPageProfileRequest()', () => {
  it('sends null for blank text and trims what is kept', () => {
    expect(
      toPublicPageProfileRequest({
        coverImageUrl: '  ',
        galleryImageUrls: [],
        longDescription: '  Texto  ',
        inclusions: [],
        preparationNotes: '',
      }),
    ).toEqual({
      coverImageUrl: null,
      galleryImageUrls: [],
      longDescription: 'Texto',
      inclusions: [],
      preparationNotes: null,
    });
  });

  it('drops empty gallery slots and blank inclusions, keeping order', () => {
    const request = toPublicPageProfileRequest({
      coverImageUrl: 'cover.webp',
      galleryImageUrls: ['g1.webp', '', 'g2.webp'],
      longDescription: '',
      inclusions: ['  Chá ', '', '   ', 'Toalhas'].map((text) => newInclusionDraft(text)),
      preparationNotes: 'Chegue cedo.',
    });

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

    expect(toPublicPageProfileRequest(toPublicPageDraft(profile))).toEqual(profile);
  });
});
