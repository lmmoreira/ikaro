import type { HotsiteBrandingResponse } from '@beloauto/types';
import { describe, expect, it } from 'vitest';

// next/font/google is aliased to __mocks__/next-font-google.ts in vitest.config.ts
import { applyBranding } from './apply-branding';

type CSSTokens = Record<string, string>;

function makeBranding(overrides?: Partial<HotsiteBrandingResponse>): HotsiteBrandingResponse {
  return {
    logoUrl: '',
    primaryColor: '#0055A4',
    secondaryColor: '#FFFFFF',
    backgroundColor: '#F5F5F5',
    textColor: '#111111',
    headingFontFamily: 'Inter',
    bodyFontFamily: 'Roboto',
    borderRadius: 'rounded',
    spacing: 'comfortable',
    shadowStyle: 'subtle',
    buttonStyle: 'filled',
    ...overrides,
  };
}

describe('applyBranding', () => {
  it('maps color tokens to CSS custom properties', () => {
    const result = applyBranding(makeBranding()) as CSSTokens;

    expect(result['--ba-primary']).toBe('#0055A4');
    expect(result['--ba-secondary']).toBe('#FFFFFF');
    expect(result['--ba-background']).toBe('#F5F5F5');
    expect(result['--ba-text']).toBe('#111111');
  });

  it('resolves heading and body font families to var() references', () => {
    const result = applyBranding(
      makeBranding({ headingFontFamily: 'Poppins', bodyFontFamily: 'Lato' }),
    ) as CSSTokens;

    expect(result['--ba-heading-font']).toBe('var(--font-poppins)');
    expect(result['--ba-body-font']).toBe('var(--font-lato)');
  });

  it('falls back to Inter when font family is not in the allow-list', () => {
    const result = applyBranding(makeBranding({ headingFontFamily: 'Comic Sans' })) as CSSTokens;

    expect(result['--ba-heading-font']).toBe('var(--font-inter)');
  });

  it('falls back to Inter for body font when family is not in the allow-list', () => {
    const result = applyBranding(makeBranding({ bodyFontFamily: 'Wingdings' })) as CSSTokens;

    expect(result['--ba-body-font']).toBe('var(--font-inter)');
  });

  it('maps border-radius variants correctly', () => {
    expect(
      (applyBranding(makeBranding({ borderRadius: 'sharp' })) as CSSTokens)['--ba-radius'],
    ).toBe('0px');
    expect(
      (applyBranding(makeBranding({ borderRadius: 'rounded' })) as CSSTokens)['--ba-radius'],
    ).toBe('8px');
    expect(
      (applyBranding(makeBranding({ borderRadius: 'pill' })) as CSSTokens)['--ba-radius'],
    ).toBe('9999px');
  });

  it('maps spacing variants to section padding tokens', () => {
    expect(
      (applyBranding(makeBranding({ spacing: 'compact' })) as CSSTokens)['--ba-section-py'],
    ).toBe('3rem');
    expect(
      (applyBranding(makeBranding({ spacing: 'comfortable' })) as CSSTokens)['--ba-section-py'],
    ).toBe('5rem');
    expect(
      (applyBranding(makeBranding({ spacing: 'spacious' })) as CSSTokens)['--ba-section-py'],
    ).toBe('8rem');
  });

  it('maps shadow style variants', () => {
    expect((applyBranding(makeBranding({ shadowStyle: 'none' })) as CSSTokens)['--ba-shadow']).toBe(
      'none',
    );
    expect(
      (applyBranding(makeBranding({ shadowStyle: 'subtle' })) as CSSTokens)['--ba-shadow'],
    ).toContain('rgba');
    expect(
      (applyBranding(makeBranding({ shadowStyle: 'strong' })) as CSSTokens)['--ba-shadow'],
    ).toContain('rgba');
  });

  it('passes button style through as-is', () => {
    const result = applyBranding(makeBranding({ buttonStyle: 'outline' })) as CSSTokens;

    expect(result['--ba-btn-variant']).toBe('outline');
  });

  it('derives filled button tokens: primary bg, white text, primary border', () => {
    const result = applyBranding(makeBranding({ buttonStyle: 'filled' })) as CSSTokens;

    expect(result['--ba-btn-bg']).toBe('var(--ba-primary)');
    expect(result['--ba-btn-text']).toBe('#ffffff');
    expect(result['--ba-btn-border']).toBe('var(--ba-primary)');
  });

  it('derives outline button tokens: transparent bg, primary text, primary border', () => {
    const result = applyBranding(makeBranding({ buttonStyle: 'outline' })) as CSSTokens;

    expect(result['--ba-btn-bg']).toBe('transparent');
    expect(result['--ba-btn-text']).toBe('var(--ba-primary)');
    expect(result['--ba-btn-border']).toBe('var(--ba-primary)');
  });

  it('derives ghost button tokens: transparent bg, primary text, transparent border', () => {
    const result = applyBranding(makeBranding({ buttonStyle: 'ghost' })) as CSSTokens;

    expect(result['--ba-btn-bg']).toBe('transparent');
    expect(result['--ba-btn-text']).toBe('var(--ba-primary)');
    expect(result['--ba-btn-border']).toBe('transparent');
  });

  describe('--ba-hero-text contrast', () => {
    it('derives --ba-hero-text from backgroundColor when it contrasts with primaryColor', () => {
      const result = applyBranding(
        makeBranding({ primaryColor: '#0055A4', backgroundColor: '#FFFFFF', textColor: '#111111' }),
      ) as CSSTokens;

      expect(result['--ba-hero-text']).toBe('#FFFFFF');
    });

    it('falls back to textColor when backgroundColor would not contrast with primaryColor', () => {
      const result = applyBranding(
        makeBranding({ primaryColor: '#F5F5F5', backgroundColor: '#FFFFFF', textColor: '#111111' }),
      ) as CSSTokens;

      expect(result['--ba-hero-text']).toBe('#111111');
    });
  });

  it('falls back to filled button style when buttonStyle is not a known variant', () => {
    const branding = makeBranding({ buttonStyle: 'unknown' as 'filled' });
    const result = applyBranding(branding) as CSSTokens;

    expect(result['--ba-btn-bg']).toBe('var(--ba-primary)');
    expect(result['--ba-btn-text']).toBe('#ffffff');
    expect(result['--ba-btn-border']).toBe('var(--ba-primary)');
  });

  describe('button color overrides', () => {
    it('defaults --ba-btn-hover-bg to --ba-btn-bg for filled when unset (no-op hover)', () => {
      const result = applyBranding(makeBranding({ buttonStyle: 'filled' })) as CSSTokens;

      expect(result['--ba-btn-hover-bg']).toBe(result['--ba-btn-bg']);
    });

    it.each(['outline', 'ghost'] as const)(
      'defaults --ba-btn-hover-bg to transparent for %s when buttonBackgroundColor is unset',
      (buttonStyle) => {
        const result = applyBranding(makeBranding({ buttonStyle })) as CSSTokens;

        expect(result['--ba-btn-hover-bg']).toBe('transparent');
      },
    );

    it('filled + buttonBackgroundColor overrides bg, border, and hover-bg', () => {
      const result = applyBranding(
        makeBranding({ buttonStyle: 'filled', buttonBackgroundColor: '#fbbf24' }),
      ) as CSSTokens;

      expect(result['--ba-btn-bg']).toBe('#fbbf24');
      expect(result['--ba-btn-border']).toBe('#fbbf24');
      expect(result['--ba-btn-hover-bg']).toBe('#fbbf24');
    });

    it('filled + buttonTextColor overrides text only', () => {
      const result = applyBranding(
        makeBranding({ buttonStyle: 'filled', buttonTextColor: '#0f172a' }),
      ) as CSSTokens;

      expect(result['--ba-btn-text']).toBe('#0f172a');
      expect(result['--ba-btn-bg']).toBe('var(--ba-primary)');
    });

    it('outline + buttonTextColor overrides both text and border', () => {
      const result = applyBranding(
        makeBranding({ buttonStyle: 'outline', buttonTextColor: '#0f172a' }),
      ) as CSSTokens;

      expect(result['--ba-btn-text']).toBe('#0f172a');
      expect(result['--ba-btn-border']).toBe('#0f172a');
    });

    it('outline + buttonBackgroundColor sets hover-bg only — resting bg stays transparent', () => {
      const result = applyBranding(
        makeBranding({ buttonStyle: 'outline', buttonBackgroundColor: '#fbbf24' }),
      ) as CSSTokens;

      expect(result['--ba-btn-bg']).toBe('transparent');
      expect(result['--ba-btn-hover-bg']).toBe('#fbbf24');
    });

    it('ghost + buttonTextColor overrides text; border stays transparent', () => {
      const result = applyBranding(
        makeBranding({ buttonStyle: 'ghost', buttonTextColor: '#0f172a' }),
      ) as CSSTokens;

      expect(result['--ba-btn-text']).toBe('#0f172a');
      expect(result['--ba-btn-border']).toBe('transparent');
    });

    it('ghost + buttonBackgroundColor sets hover-bg', () => {
      const result = applyBranding(
        makeBranding({ buttonStyle: 'ghost', buttonBackgroundColor: '#fbbf24' }),
      ) as CSSTokens;

      expect(result['--ba-btn-hover-bg']).toBe('#fbbf24');
    });
  });
});
