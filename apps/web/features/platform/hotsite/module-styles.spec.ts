import { describe, expect, it } from 'vitest';
import {
  LEGACY_SECTION_PADDING,
  legacySectionBackground,
  sectionCardBackground,
  sectionHeadingStyle,
  sectionTextColor,
} from './module-styles';

// The helpers every flow section reads its colours through. Each falls back to today's tenant
// token, so a section without `presentation.surface` is byte-for-byte what it always was; the
// scoped `--ba-section-*` token only wins once the section shell has set it.
describe('flow section style helpers', () => {
  it('text follows the section token, falling back to the tenant text colour', () => {
    expect(sectionTextColor).toBe('var(--ba-section-text, var(--ba-text))');
    expect(sectionHeadingStyle).toMatchObject({
      fontFamily: 'var(--ba-heading-font)',
      color: sectionTextColor,
    });
  });

  it.each([
    [undefined, 'var(--ba-background)'],
    ['default', 'var(--ba-background)'],
    ['alt', 'var(--ba-secondary)'],
  ] as const)('the legacy background of a %s section is %s', (variant, expected) => {
    expect(legacySectionBackground(variant)).toBe(expected);
  });

  it.each([
    [undefined, 'var(--ba-section-card-bg, var(--ba-secondary))'],
    ['default', 'var(--ba-section-card-bg, var(--ba-secondary))'],
    ['alt', 'var(--ba-section-card-bg, var(--ba-background))'],
  ] as const)(
    'a %s section card uses the section card token, falling back to %s',
    (variant, expected) => {
      expect(sectionCardBackground(variant)).toBe(expected);
    },
  );

  it('keeps the long-standing section padding', () => {
    expect(LEGACY_SECTION_PADDING).toBe('var(--ba-section-py) 1.5rem');
  });
});
