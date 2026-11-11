import { describe, expect, it } from 'vitest';
import { BRANDED_FIELD_PLACEHOLDER_CLASS, brandedFieldStyle } from './branded-field-style';

describe('brandedFieldStyle', () => {
  it('paints the secondary surface with the derived readable text colour', () => {
    const style = brandedFieldStyle();

    expect(style.backgroundColor).toBe('var(--ba-secondary)');
    expect(style.color).toBe('var(--ba-secondary-text)');
    expect(style.borderRadius).toBe('var(--ba-radius)');
    expect(style.borderColor).toBe('var(--ba-secondary)');
  });

  it('drops the border colour when invalid, so the branded error border applies', () => {
    const style = brandedFieldStyle({ invalid: true });

    expect(style.borderColor).toBeUndefined();
    expect(style.color).toBe('var(--ba-secondary-text)');
    expect(style.backgroundColor).toBe('var(--ba-secondary)');
  });

  it('never uses --ba-text or --ba-primary for text, so no caller path reintroduces the bug', () => {
    for (const invalid of [false, true]) {
      const markup = JSON.stringify(brandedFieldStyle({ invalid }));

      expect(markup).not.toContain('--ba-text');
      expect(markup).not.toContain('--ba-primary');
    }
  });

  it('exports a placeholder class bound to the derived placeholder token', () => {
    expect(BRANDED_FIELD_PLACEHOLDER_CLASS).toContain('--ba-secondary-muted');
    expect(BRANDED_FIELD_PLACEHOLDER_CLASS.startsWith('placeholder:')).toBe(true);
    expect(BRANDED_FIELD_PLACEHOLDER_CLASS).not.toContain('--ba-text');
  });
});
