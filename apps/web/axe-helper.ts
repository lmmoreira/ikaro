import { configureAxe } from 'jest-axe';

// Disable colour-contrast: jsdom cannot resolve CSS custom properties
// (--ba-primary, --ba-hero-bg, etc.), so the rule always false-positives on
// hotsite branding tokens. WCAG AA contrast correctness is covered by the
// contrastRatio unit tests in apply-branding.spec.ts.
//
// Note: this caveat is hotsite-specific. Dashboard/account components use
// Ikaro's fixed design system and should use the full default ruleset.
export const axe = configureAxe({
  rules: { 'color-contrast': { enabled: false } },
});
