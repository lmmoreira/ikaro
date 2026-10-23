import { HOTSITE_IMAGE_SLOT_CASES } from '@ikaro/types/testing/hotsite-module-contract';
import {
  DEFAULT_HOTSITE_BRANDING,
  DEFAULT_HOTSITE_SEO,
  HotsiteModule,
} from '../hotsite-config.aggregate';
import { HotsiteImagePathsService } from './hotsite-image-paths.service';
import { HotsiteImageUrlResolver } from './hotsite-image-url-resolver.service';

// collect(), mapPaths() and the URL resolver each walk the layout's image fields by hand, and must
// stay field-for-field in step (the web mirrors run the same table in their own spec). A slot one
// of them misses is never promoted from tmp/, never resolved, or never deleted when superseded.
describe('hotsite image walkers visit exactly the same slots', () => {
  const paths = new HotsiteImagePathsService();
  const resolver = new HotsiteImageUrlResolver();
  const layoutOf = (module: unknown): HotsiteModule[] => [module as HotsiteModule];

  describe.each(HOTSITE_IMAGE_SLOT_CASES)('$name', ({ module, paths: expected }) => {
    it('collect() reports exactly the slot paths', () => {
      expect(
        paths.collect(DEFAULT_HOTSITE_BRANDING, layoutOf(module), DEFAULT_HOTSITE_SEO),
      ).toEqual(expected);
    });

    it('mapPaths() rewrites every slot and nothing else', () => {
      const mapped = paths.mapPaths(
        DEFAULT_HOTSITE_BRANDING,
        layoutOf(module),
        DEFAULT_HOTSITE_SEO,
        (path) => `promoted/${path}`,
      );

      expect(paths.collect(DEFAULT_HOTSITE_BRANDING, mapped.layout, DEFAULT_HOTSITE_SEO)).toEqual(
        expected.map((path) => `promoted/${path}`),
      );
      // Everything that is not an image path survives the rewrite untouched.
      expect(mapped.layout[0].type).toBe(module.type);
      expect(mapped.layout[0].enabled).toBe(module.enabled);
    });

    it('resolve() turns every slot into a public URL and nothing else', () => {
      const resolved = resolver.resolve(
        DEFAULT_HOTSITE_BRANDING,
        layoutOf(module),
        DEFAULT_HOTSITE_SEO,
        (path) => `https://cdn.test/${path}`,
      );

      expect(paths.collect(DEFAULT_HOTSITE_BRANDING, resolved.layout, DEFAULT_HOTSITE_SEO)).toEqual(
        expected.map((path) => `https://cdn.test/${path}`),
      );
    });
  });

  it('leaves presentation intact when it holds no background image', () => {
    const presentation = { surface: 'primary', overlay: { type: 'none' } };
    const input = layoutOf({
      type: 'ABOUT',
      enabled: true,
      data: { title: 'T', body: 'B', imagePosition: 'left' },
      presentation,
    });

    const mapped = paths.mapPaths(DEFAULT_HOTSITE_BRANDING, input, DEFAULT_HOTSITE_SEO, (p) => p);
    const resolved = resolver.resolve(
      DEFAULT_HOTSITE_BRANDING,
      input,
      DEFAULT_HOTSITE_SEO,
      (p) => p,
    );

    expect(mapped.layout[0].presentation).toEqual(presentation);
    expect(resolved.layout[0].presentation).toEqual(presentation);
  });

  it('leaves a module without presentation without a presentation key', () => {
    const input = layoutOf({
      type: 'ABOUT',
      enabled: true,
      data: { title: 'T', body: 'B', imagePosition: 'left' },
    });

    const mapped = paths.mapPaths(DEFAULT_HOTSITE_BRANDING, input, DEFAULT_HOTSITE_SEO, (p) => p);

    expect('presentation' in mapped.layout[0]).toBe(false);
  });

  it('keeps a collage-callout image alt text while rewriting its url', () => {
    const input = layoutOf({
      type: 'CONTENT_BLOCK',
      enabled: true,
      data: {
        variant: 'collage-callout',
        title: 'T',
        images: [{ url: 'a.jpg', alt: 'Interior' }, { url: 'b.jpg' }],
      },
    });

    const mapped = paths.mapPaths(
      DEFAULT_HOTSITE_BRANDING,
      input,
      DEFAULT_HOTSITE_SEO,
      (p) => `x/${p}`,
    );

    expect(mapped.layout[0].data).toMatchObject({
      images: [{ url: 'x/a.jpg', alt: 'Interior' }, { url: 'x/b.jpg' }],
    });
  });
});
