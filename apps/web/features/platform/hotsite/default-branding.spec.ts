import { describe, expect, it } from 'vitest';
import { applyBranding } from './apply-branding';
import { DEFAULT_HOTSITE_BRANDING } from './default-branding';

describe('DEFAULT_HOTSITE_BRANDING', () => {
  it('produces a complete set of --ba-* values via applyBranding()', () => {
    const style = applyBranding(DEFAULT_HOTSITE_BRANDING);

    expect(style['--ba-primary']).toBe('#2563EB');
    expect(style['--ba-background']).toBe('#FFFFFF');
    expect(style['--ba-text']).toBe('#111827');
    expect(style['--ba-radius']).toBe('8px');
  });
});
