import { ServicePublicProfileProps } from '../../domain/service-public-profile.vo';
import { resolveServicePublicProfileUrls } from './service-public-profile-urls';

const HOST = 'https://img.example.test/public-bucket';
const resolveUrl = (path: string) => `${HOST}/${path}`;

const PROFILE: ServicePublicProfileProps = {
  coverImageUrl: 'tenants/t1/hotsite/service-profile/u1/cover.webp',
  galleryImageUrls: [
    'tenants/t1/hotsite/service-profile/u2/a.webp',
    'tenants/t1/hotsite/service-profile/u3/b.webp',
  ],
  longDescription: 'Texto',
  inclusions: ['Chá'],
  preparationNotes: null,
};

describe('resolveServicePublicProfileUrls', () => {
  it('resolves the cover and every gallery entry and leaves the text fields alone', () => {
    expect(resolveServicePublicProfileUrls(PROFILE, resolveUrl)).toEqual({
      ...PROFILE,
      coverImageUrl: `${HOST}/tenants/t1/hotsite/service-profile/u1/cover.webp`,
      galleryImageUrls: [
        `${HOST}/tenants/t1/hotsite/service-profile/u2/a.webp`,
        `${HOST}/tenants/t1/hotsite/service-profile/u3/b.webp`,
      ],
    });
  });

  it('passes an already-absolute value and a null cover through unchanged', () => {
    const absolute = 'https://elsewhere.example.test/x.webp';

    const result = resolveServicePublicProfileUrls(
      { ...PROFILE, coverImageUrl: null, galleryImageUrls: [absolute] },
      resolveUrl,
    );

    expect(result.coverImageUrl).toBeNull();
    expect(result.galleryImageUrls).toEqual([absolute]);
  });

  it('does not mutate its input', () => {
    const input = structuredClone(PROFILE);

    resolveServicePublicProfileUrls(input, resolveUrl);

    expect(input).toEqual(PROFILE);
  });
});
