import { describe, expect, it } from 'vitest';
import {
  BRANDED_FIELD_PLACEHOLDER_CLASS,
  brandedFieldProps,
  brandedFieldStyle,
} from './branded-field-style';

describe('brandedFieldStyle', () => {
  it('paints the secondary surface with the derived readable text colour', () => {
    const style = brandedFieldStyle();

    expect(style.backgroundColor).toBe('var(--ba-secondary)');
    expect(style.color).toBe('var(--ba-secondary-text)');
    expect(style.borderRadius).toBe('var(--ba-radius)');
    expect(style.borderColor).toBe('var(--ba-field-border)');
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

describe('brandedFieldProps', () => {
  it('adds the border width, the placeholder tint and the caller className', () => {
    const props = brandedFieldProps({ className: 'w-full px-3' });

    expect(props.className.split(' ')).toEqual(
      expect.arrayContaining(['border', 'w-full', 'px-3']),
    );
    expect(props.className).toContain(BRANDED_FIELD_PLACEHOLDER_CLASS);
    expect(props.style.borderColor).toBe('var(--ba-field-border)');
    expect('aria-invalid' in props).toBe(false);
  });

  it('adds the red outline and aria-invalid together, so the two cannot disagree', () => {
    const props = brandedFieldProps({ invalid: true });

    expect(props.className).toContain('border-red-600');
    expect(props['aria-invalid']).toBe(true);
    expect(props.style.borderColor).toBeUndefined();
  });

  it('lets the caller style change only the radius', () => {
    const props = brandedFieldProps({ style: { borderRadius: '0 8px 8px 0' } });

    expect(props.style.borderRadius).toBe('0 8px 8px 0');
    expect(props.style.backgroundColor).toBe('var(--ba-secondary)');
  });

  it('ignores any other key a structurally wider style object carries', () => {
    const wider = { borderRadius: '4px', borderColor: 'red', backgroundColor: 'red' };
    const props = brandedFieldProps({ style: wider });

    expect(props.style.borderRadius).toBe('4px');
    expect(props.style.borderColor).toBe('var(--ba-field-border)');
    expect(props.style.backgroundColor).toBe('var(--ba-secondary)');
  });
});
