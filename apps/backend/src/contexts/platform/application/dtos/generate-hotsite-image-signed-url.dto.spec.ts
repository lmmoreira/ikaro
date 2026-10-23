import { HOTSITE_IMAGE_PURPOSES } from '@ikaro/types';
import { GenerateHotsiteImageSignedUrlSchema } from './generate-hotsite-image-signed-url.dto';

const base = { fileName: 'photo.jpg', contentType: 'image/jpeg' };

describe('GenerateHotsiteImageSignedUrlSchema', () => {
  it.each(HOTSITE_IMAGE_PURPOSES)('accepts the %s upload purpose', (purpose) => {
    expect(GenerateHotsiteImageSignedUrlSchema.safeParse({ ...base, purpose }).success).toBe(true);
  });

  it('accepts exactly the purposes in the shared tuple, including content-block, section-background and service-profile', () => {
    expect(HOTSITE_IMAGE_PURPOSES).toEqual(
      expect.arrayContaining(['content-block', 'section-background', 'service-profile']),
    );
    expect(GenerateHotsiteImageSignedUrlSchema.shape.purpose.options).toEqual([
      ...HOTSITE_IMAGE_PURPOSES,
    ]);
  });

  it('rejects an unknown purpose', () => {
    expect(
      GenerateHotsiteImageSignedUrlSchema.safeParse({ ...base, purpose: 'video' }).success,
    ).toBe(false);
  });

  it('rejects a fileName containing a path separator', () => {
    expect(
      GenerateHotsiteImageSignedUrlSchema.safeParse({
        ...base,
        fileName: '../x.jpg',
        purpose: 'hero',
      }).success,
    ).toBe(false);
  });
});
