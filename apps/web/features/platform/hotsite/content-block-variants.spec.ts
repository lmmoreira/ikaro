import { describe, expect, it } from 'vitest';
import { ContentBlockModuleDataSchema, type ContentBlockModuleData } from '@ikaro/types';
import {
  CONTENT_BLOCK_VARIANTS,
  clearEmpty,
  switchContentBlockVariant,
} from './content-block-variants';

const STATEMENT: ContentBlockModuleData = {
  variant: 'image-statement',
  title: 'Quem somos',
  eyebrow: 'Nossa casa',
  align: 'center',
  body: 'Texto **forte**',
  cta: { label: 'Agendar', target: 'booking-form' },
};

describe('switchContentBlockVariant', () => {
  it.each(CONTENT_BLOCK_VARIANTS)('switching to %s keeps the shared fields', (variant) => {
    const next = switchContentBlockVariant(STATEMENT, variant);

    expect(next).toMatchObject({
      variant,
      title: 'Quem somos',
      eyebrow: 'Nossa casa',
      align: 'center',
      body: 'Texto **forte**',
      cta: { label: 'Agendar', target: 'booking-form' },
    });
  });

  // Strict schema: a key from the previous variant would be rejected, so none may survive a switch.
  it('drops the previous variant-specific keys', () => {
    const grid = switchContentBlockVariant(STATEMENT, 'trust-grid');
    const steps = switchContentBlockVariant(
      { ...grid, appearance: 'tiles' } as ContentBlockModuleData,
      'process-steps',
    );

    expect(steps).not.toHaveProperty('appearance');
    expect(steps).toHaveProperty('items');
    expect(Object.keys(switchContentBlockVariant(steps, 'immersive-statement')).sort()).toEqual(
      ['align', 'body', 'cta', 'eyebrow', 'title', 'variant'].sort(),
    );
  });

  // Every variant but the collage starts valid, so choosing it never strands the manager.
  it.each(CONTENT_BLOCK_VARIANTS.filter((variant) => variant !== 'collage-callout'))(
    '%s starts out valid',
    (variant) => {
      const next = switchContentBlockVariant(STATEMENT, variant);

      expect(ContentBlockModuleDataSchema.safeParse(next).success).toBe(true);
    },
  );

  it('starts the collage with two empty slots, invalid until both hold an image', () => {
    const collage = switchContentBlockVariant(STATEMENT, 'collage-callout');

    expect(collage).toMatchObject({ images: [{ url: '' }, { url: '' }] });
    expect(ContentBlockModuleDataSchema.safeParse(collage).success).toBe(false);
  });

  it('returns the same object when the variant is unchanged', () => {
    expect(switchContentBlockVariant(STATEMENT, 'image-statement')).toBe(STATEMENT);
  });
});

describe('clearEmpty', () => {
  it('removes the named keys when empty or undefined, keeping everything else', () => {
    expect(
      clearEmpty({ title: '', label: '', note: undefined, count: 0 }, ['label', 'note']),
    ).toEqual({
      title: '',
      count: 0,
    });
  });

  // Negative guarantee: a required field is allowed to be empty and must stay present.
  it('leaves an empty key it was not asked about', () => {
    expect(clearEmpty({ label: '', description: '' }, ['description'])).toEqual({ label: '' });
  });
});
