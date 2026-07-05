import { describe, expect, it } from 'vitest';
import { applyMaskTemplate } from './mask-template';

describe('applyMaskTemplate', () => {
  it('interleaves digits into literal characters of the template', () => {
    expect(applyMaskTemplate('30130100', '#####-###')).toBe('30130-100');
  });

  it('stops once the digits run out, leaving the template unfinished', () => {
    expect(applyMaskTemplate('301', '#####-###')).toBe('301');
    // Exactly fills the first digit group — the trailing literal isn't emitted until
    // another digit follows it (matches the existing phone-mask behavior).
    expect(applyMaskTemplate('30130', '#####-###')).toBe('30130');
    expect(applyMaskTemplate('301301', '#####-###')).toBe('30130-1');
  });

  it('ignores extra digits beyond what the template has placeholders for', () => {
    expect(applyMaskTemplate('301301000000', '#####-###')).toBe('30130-100');
  });

  it('returns an empty string for empty digits', () => {
    expect(applyMaskTemplate('', '#####-###')).toBe('');
  });
});
