import { describe, expect, it } from 'vitest';
import type { HotsiteModuleResponse } from '@ikaro/types';
import {
  DEFAULT_MODULE_DATA,
  MATERIALIZED_MODULE_ORDER,
  MODULE_ORDER,
  materializeLayout,
} from './default-layout';
import { isValidModuleData } from './module-schemas';

describe('materializeLayout', () => {
  it('appends all 10 module types with sensible defaults for a brand-new tenant (layout: [])', () => {
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
      'CHATBOT',
      'LEAD_FORM',
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
      'CHATBOT',
      'LEAD_FORM',
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
    expect(byType.CHATBOT).toEqual({});
    expect(byType.LEAD_FORM).toMatchObject({ title: '', ctaLabel: '' });
  });
});

describe('MODULE_ORDER / MATERIALIZED_MODULE_ORDER (TD56)', () => {
  it('lists all twelve module types with NAVIGATION first', () => {
    expect(MODULE_ORDER).toHaveLength(12);
    expect(MODULE_ORDER[0]).toBe('NAVIGATION');
    expect(MODULE_ORDER).toContain('CONTENT_BLOCK');
  });

  it('materializes everything except NAVIGATION and CONTENT_BLOCK, until Story 5 exposes them', () => {
    expect(MATERIALIZED_MODULE_ORDER).toEqual(
      MODULE_ORDER.filter((type) => type !== 'NAVIGATION' && type !== 'CONTENT_BLOCK'),
    );
  });

  // Negative guarantee: appending them now would show a Layout row whose Configure opens a placeholder.
  it('never appends NAVIGATION or CONTENT_BLOCK to a layout that lacks them', () => {
    const types = materializeLayout([]).map((module) => module.type);

    expect(types).not.toContain('NAVIGATION');
    expect(types).not.toContain('CONTENT_BLOCK');
    expect(types).toHaveLength(10);
  });

  it('keeps NAVIGATION and CONTENT_BLOCK exactly where they are when the manifest already has them', () => {
    const existing: HotsiteModuleResponse[] = [
      { type: 'NAVIGATION', enabled: true, data: { items: [] } },
      { type: 'CONTENT_BLOCK', enabled: false, data: { variant: 'image-statement', title: 'T' } },
    ];

    const result = materializeLayout(existing);

    expect(result.slice(0, 2)).toEqual(existing);
    expect(result.map((m) => m.type).filter((t) => t === 'NAVIGATION')).toHaveLength(1);
  });
});

// Part of the legacy audit: a default a manager's draft is seeded with must itself pass the schema
// the Manifesto tab and the backend enforce, or the very first save of a fresh layout would fail.
describe('DEFAULT_MODULE_DATA', () => {
  it.each(MODULE_ORDER)('the %s default passes its module schema', (type) => {
    expect(DEFAULT_MODULE_DATA[type], `${type} has no default`).toBeDefined();
    expect(isValidModuleData(type, DEFAULT_MODULE_DATA[type])).toBe(true);
  });
});
