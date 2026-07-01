import { describe, expect, it } from 'vitest';

// next/font/google is aliased to __mocks__/next-font-google.ts in vitest.config.ts
import { FONT_CLASS_MAP, FONT_MAP, FONT_VARIABLES, getActiveFontVariables } from './font-config';

const SUPPORTED_FONTS = [
  'Inter',
  'Poppins',
  'Playfair Display',
  'Montserrat',
  'Raleway',
  'Oswald',
  'Lato',
  'Roboto',
];

describe('FONT_VARIABLES', () => {
  it('exports one CSS variable string per font', () => {
    expect(FONT_VARIABLES).toHaveLength(SUPPORTED_FONTS.length);
  });

  it('every entry is a CSS custom property string', () => {
    for (const v of FONT_VARIABLES) {
      expect(v).toMatch(/^--font-/);
    }
  });
});

describe('FONT_MAP', () => {
  it('contains an entry for every supported font', () => {
    for (const name of SUPPORTED_FONTS) {
      expect(FONT_MAP).toHaveProperty(name);
    }
  });

  it('values are var() references matching the variable name', () => {
    expect(FONT_MAP['Inter']).toBe('var(--font-inter)');
    expect(FONT_MAP['Playfair Display']).toBe('var(--font-playfair-display)');
    expect(FONT_MAP['Roboto']).toBe('var(--font-roboto)');
  });
});

describe('FONT_CLASS_MAP', () => {
  it('contains an entry for every supported font', () => {
    for (const name of SUPPORTED_FONTS) {
      expect(FONT_CLASS_MAP).toHaveProperty(name);
    }
  });

  it('values are CSS variable class strings', () => {
    expect(FONT_CLASS_MAP['Inter']).toBe('--font-inter');
    expect(FONT_CLASS_MAP['Poppins']).toBe('--font-poppins');
    expect(FONT_CLASS_MAP['Playfair Display']).toBe('--font-playfair-display');
  });
});

describe('getActiveFontVariables', () => {
  it('returns the class variables for heading and body fonts', () => {
    const result = getActiveFontVariables('Poppins', 'Lato');
    expect(result).toEqual(['--font-poppins', '--font-lato']);
  });

  it('deduplicates when heading and body are the same font', () => {
    const result = getActiveFontVariables('Inter', 'Inter');
    expect(result).toEqual(['--font-inter']);
  });

  it('falls back to Inter for an unknown heading font, matching applyBranding fallback', () => {
    const result = getActiveFontVariables('UnknownFont', 'Roboto');
    expect(result).toEqual(['--font-inter', '--font-roboto']);
  });

  it('falls back to Inter when both fonts are unknown, deduplicating to one entry', () => {
    const result = getActiveFontVariables('Unknown', 'AlsoUnknown');
    expect(result).toEqual(['--font-inter']);
  });
});
