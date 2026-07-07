import { describe, expect, it } from 'vitest';
import type { HotsiteModuleResponse } from '@ikaro/types';
import { materializeLayout } from './default-layout';

describe('materializeLayout', () => {
  it('appends all 8 module types with sensible defaults for a brand-new tenant (layout: [])', () => {
    const result = materializeLayout([]);

    expect(result.map((m) => m.type)).toEqual([
      'HERO',
      'SERVICE_LIST',
      'GALLERY',
      'TESTIMONIALS',
      'BOOKING_CTA',
      'ABOUT',
      'CONTACT',
      'FOOTER',
    ]);
    expect(result.every((m) => m.enabled === false)).toBe(true);
  });

  it('preserves the existing custom order and only appends missing types at the end', () => {
    const existing: HotsiteModuleResponse[] = [
      { type: 'GALLERY', enabled: true, data: { images: [], layout: 'grid', maxVisible: 6 } },
      {
        type: 'HERO',
        enabled: true,
        data: { variant: 'centered', title: 'X', ctaLabel: 'Y', ctaTarget: 'booking-form' },
      },
    ];

    const result = materializeLayout(existing);

    expect(result[0].type).toBe('GALLERY');
    expect(result[1].type).toBe('HERO');
    expect(result.map((m) => m.type)).toEqual([
      'GALLERY',
      'HERO',
      'SERVICE_LIST',
      'TESTIMONIALS',
      'BOOKING_CTA',
      'ABOUT',
      'CONTACT',
      'FOOTER',
    ]);
  });

  it('does not modify already-present modules', () => {
    const existing: HotsiteModuleResponse[] = [
      {
        type: 'HERO',
        enabled: true,
        data: {
          variant: 'left-aligned',
          title: 'Real title',
          ctaLabel: 'Ir',
          ctaTarget: 'gallery',
        },
      },
    ];

    const result = materializeLayout(existing);

    expect(result[0]).toEqual(existing[0]);
  });

  it("produces minimal data satisfying each module type's required fields", () => {
    const result = materializeLayout([]);
    const byType = Object.fromEntries(result.map((m) => [m.type, m.data]));

    expect(byType.HERO).toMatchObject({ variant: 'centered', ctaTarget: 'booking-form' });
    expect(byType.SERVICE_LIST).toMatchObject({
      showPrices: true,
      showPoints: true,
      layout: 'grid',
    });
    expect(byType.GALLERY).toMatchObject({ images: [], layout: 'grid', maxVisible: 6 });
    expect(byType.TESTIMONIALS).toMatchObject({ items: [], layout: 'grid' });
    expect(byType.BOOKING_CTA).toMatchObject({ title: '', ctaLabel: '' });
    expect(byType.ABOUT).toMatchObject({ title: '', body: '', imagePosition: 'left' });
    expect(byType.CONTACT).toMatchObject({ showAddress: true, showMap: true });
    expect(byType.FOOTER).toEqual({});
  });
});
