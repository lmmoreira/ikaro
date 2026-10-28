import { describe, expect, it } from 'vitest';
import { bufferToField, fieldToBuffer, isValidBufferField } from './service-buffer-field';

describe('service buffer field', () => {
  it('shows no override as a blank field and keeps zero as "0"', () => {
    expect(bufferToField(null)).toBe('');
    expect(bufferToField(0)).toBe('0');
    expect(bufferToField(15)).toBe('15');
  });

  it('saves a blank field as null — inherit — and never as zero', () => {
    expect(fieldToBuffer('')).toBeNull();
    expect(fieldToBuffer('0')).toBe(0);
    expect(fieldToBuffer('15')).toBe(15);
  });

  it.each(['', '0', '15', '120'])('accepts %j', (field) => {
    expect(isValidBufferField(field)).toBe(true);
  });

  it.each(['-1', '1.5', 'abc'])('rejects %j', (field) => {
    expect(isValidBufferField(field)).toBe(false);
  });
});
