import { ServicePublicProfileInvalidError } from './errors/booking-domain.error';
import { ServicePublicProfile } from './service-public-profile.vo';

const PERMANENT = 'tenants/t/hotsite/service-profile/u/a.webp';

describe('ServicePublicProfile', () => {
  it('creates an empty profile from an empty input', () => {
    expect(ServicePublicProfile.create({}).toJSON()).toEqual({
      coverImageUrl: null,
      galleryImageUrls: [],
      longDescription: null,
      inclusions: [],
      preparationNotes: null,
    });
  });

  it('trims text, drops blank inclusions and keeps order', () => {
    const profile = ServicePublicProfile.create({
      longDescription: '  Uma pausa.  ',
      preparationNotes: '   ',
      inclusions: [' Chá ', '', '  ', 'Toalhas'],
    });
    expect(profile.longDescription).toBe('Uma pausa.');
    expect(profile.preparationNotes).toBeNull();
    expect(profile.inclusions).toEqual(['Chá', 'Toalhas']);
  });

  it('lists the cover first, then the gallery, in imagePaths()', () => {
    const profile = ServicePublicProfile.create({
      coverImageUrl: 'cover.webp',
      galleryImageUrls: ['g1.webp', 'g2.webp'],
    });
    expect(profile.imagePaths()).toEqual(['cover.webp', 'g1.webp', 'g2.webp']);
  });

  it('rewrites every image path in mapImagePaths() without mutating the original', () => {
    const profile = ServicePublicProfile.create({
      coverImageUrl: 'tmp-cover',
      galleryImageUrls: ['tmp-1', PERMANENT],
    });
    const mapped = profile.mapImagePaths((path) =>
      path.startsWith('tmp') ? `perm-${path}` : path,
    );
    expect(mapped.imagePaths()).toEqual(['perm-tmp-cover', 'perm-tmp-1', PERMANENT]);
    expect(profile.imagePaths()).toEqual(['tmp-cover', 'tmp-1', PERMANENT]);
  });

  it.each([
    ['gallery-too-large', { galleryImageUrls: Array.from({ length: 9 }, (_, i) => `g${i}.webp`) }],
    ['long-description-too-long', { longDescription: 'x'.repeat(4001) }],
    ['inclusions-too-many', { inclusions: Array.from({ length: 13 }, (_, i) => `item ${i}`) }],
    ['inclusion-too-long', { inclusions: ['x'.repeat(121)] }],
    ['preparation-notes-too-long', { preparationNotes: 'x'.repeat(1001) }],
  ])('rejects %s', (_reason, input) => {
    expect(() => ServicePublicProfile.create(input)).toThrow(ServicePublicProfileInvalidError);
  });

  it('accepts the limits exactly', () => {
    expect(() =>
      ServicePublicProfile.create({
        galleryImageUrls: Array.from({ length: 8 }, (_, i) => `g${i}.webp`),
        longDescription: 'x'.repeat(4000),
        inclusions: Array.from({ length: 12 }, () => 'x'.repeat(120)),
        preparationNotes: 'x'.repeat(1000),
      }),
    ).not.toThrow();
  });

  it.each([
    '../secret',
    '/etc/passwd',
    'https://evil.example/x.png',
    'javascript:alert(1)',
    'a/../b',
  ])('rejects an image path that is not a storage path ("%s")', (path) => {
    expect(() => ServicePublicProfile.create({ coverImageUrl: path })).toThrow(
      ServicePublicProfileInvalidError,
    );
    expect(() => ServicePublicProfile.create({ galleryImageUrls: [path] })).toThrow(
      ServicePublicProfileInvalidError,
    );
  });

  it('reconstitute() copies the arrays so later mutation of the source cannot leak in', () => {
    const source = {
      coverImageUrl: null,
      galleryImageUrls: ['g.webp'],
      longDescription: null,
      inclusions: ['a'],
      preparationNotes: null,
    };
    const profile = ServicePublicProfile.reconstitute(source);
    source.galleryImageUrls.push('hacked');
    source.inclusions.push('hacked');
    expect(profile.galleryImageUrls).toEqual(['g.webp']);
    expect(profile.inclusions).toEqual(['a']);
  });
});
