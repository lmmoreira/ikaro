import type { ContentBlockModuleData } from '@ikaro/types';

export type ContentBlockVariant = ContentBlockModuleData['variant'];

export const CONTENT_BLOCK_VARIANTS: readonly ContentBlockVariant[] = [
  'trust-grid',
  'process-steps',
  'collage-callout',
  'technical-callout',
  'image-statement',
  'immersive-statement',
];

// Bounds from Story 1's strict schema (@ikaro/types hotsite-schemas.ts). The panel enforces them
// so the usual edit can never produce a shape the schema rejects.
export const CONTENT_BLOCK_LIMITS = {
  eyebrow: 60,
  title: 120,
  body: 1000,
  ctaLabel: 40,
  trustItems: { min: 2, max: 6, label: 60, description: 140 },
  steps: { min: 2, max: 6, title: 60, body: 240, label: 30 },
  collage: { min: 2, max: 4, alt: 120 },
  facts: { max: 4, value: 20, label: 40 },
} as const;

// What every variant shares; the strict schema rejects any key a variant does not declare, so a
// variant switch carries exactly these and nothing else.
function commonFields(current: ContentBlockModuleData): Record<string, unknown> {
  const { align, eyebrow, title, body, cta } = current;
  return {
    ...(align === undefined ? {} : { align }),
    ...(eyebrow === undefined ? {} : { eyebrow }),
    title,
    ...(body === undefined ? {} : { body }),
    ...(cta === undefined ? {} : { cta }),
  };
}

function blankItems<T>(count: number, make: () => T): T[] {
  return Array.from({ length: count }, make);
}

// The minimum valid body of each variant. A collage starts with its two empty image slots: it is
// not publishable until both hold an image, which the panel says.
function variantDefaults(variant: ContentBlockVariant): Record<string, unknown> {
  switch (variant) {
    case 'trust-grid':
      return { items: blankItems(CONTENT_BLOCK_LIMITS.trustItems.min, () => ({ label: '' })) };
    case 'process-steps':
      return {
        items: blankItems(CONTENT_BLOCK_LIMITS.steps.min, () => ({ title: '', body: '' })),
      };
    case 'collage-callout':
      return { images: blankItems(CONTENT_BLOCK_LIMITS.collage.min, () => ({ url: '' })) };
    case 'technical-callout':
    case 'image-statement':
    case 'immersive-statement':
      return {};
  }
}

export function switchContentBlockVariant(
  current: ContentBlockModuleData,
  variant: ContentBlockVariant,
): ContentBlockModuleData {
  if (current.variant === variant) return current;
  return {
    variant,
    ...commonFields(current),
    ...variantDefaults(variant),
  } as ContentBlockModuleData;
}

// An optional text field left empty is removed rather than stored as '', so an untouched one and a
// cleared one read the same. Only the named keys are cleared: a required field (a title, an item's
// label) is allowed to be empty and must stay present.
export function clearEmpty<T extends object>(value: T, keys: readonly (keyof T)[]): T {
  const next = { ...value };
  for (const key of keys) {
    if (next[key] === '' || next[key] === undefined) delete next[key];
  }
  return next;
}
