import { describe, expect, it } from 'vitest';
import { leadFormControlClass } from './lead-form-field-binding';

describe('leadFormControlClass', () => {
  it('returns the base classes when the field is valid or has no binding', () => {
    expect(leadFormControlClass('w-full border')).toBe('w-full border');
    expect(leadFormControlClass('w-full border', {})).toBe('w-full border');
  });

  it('adds the branded invalid outline when the binding marks the field invalid', () => {
    expect(leadFormControlClass('w-full border', { 'aria-invalid': true })).toBe(
      'w-full border border-red-600 ring-1 ring-red-600',
    );
  });
});
