import { HOTSITE_IMAGE_PURPOSES } from '@ikaro/types';
import {
  GenerateHotsiteImageSignedUrlBodySchema,
  UpdateHotsiteContentBodySchema,
} from './hotsite-admin.schemas';

describe('GenerateHotsiteImageSignedUrlBodySchema', () => {
  it('accepts exactly the purposes in the shared tuple', () => {
    expect(GenerateHotsiteImageSignedUrlBodySchema.shape.purpose.options).toEqual([
      ...HOTSITE_IMAGE_PURPOSES,
    ]);
  });
});

describe('UpdateHotsiteContentBodySchema layout', () => {
  const parse = (layout: unknown) => UpdateHotsiteContentBodySchema.safeParse({ layout });

  it('accepts the TD56 contract: a NAVIGATION module and a module presentation', () => {
    expect(
      parse([
        { type: 'NAVIGATION', enabled: true, data: { items: [{ label: 'A', target: 'about' }] } },
        {
          type: 'ABOUT',
          enabled: true,
          data: { title: 'T', body: 'B', imagePosition: 'left' },
          presentation: { surface: 'primary' },
        },
      ]).success,
    ).toBe(true);
  });

  it('keeps presentation on the parsed body (the schema must not strip it)', () => {
    const result = parse([
      {
        type: 'ABOUT',
        enabled: true,
        data: { title: 'T', body: 'B', imagePosition: 'left' },
        presentation: { surface: 'primary' },
      },
    ]);
    expect(result.success && result.data.layout?.[0].presentation).toEqual({ surface: 'primary' });
  });

  it('rejects a module whose data violates its closed shape', () => {
    expect(
      parse([{ type: 'NAVIGATION', enabled: true, data: { items: [], extra: 1 } }]).success,
    ).toBe(false);
  });
});
