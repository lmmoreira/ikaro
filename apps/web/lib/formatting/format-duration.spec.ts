import { describe, expect, it } from 'vitest';
import { formatDuration } from './format-duration';

describe('formatDuration', () => {
  it('formats durations under 60 minutes as "X min"', () => {
    expect(formatDuration(45)).toBe('45 min');
  });

  it('formats exact hours as "Xh"', () => {
    expect(formatDuration(60)).toBe('1h');
    expect(formatDuration(120)).toBe('2h');
  });

  it('formats hours with remainder as "Xh Ymin"', () => {
    expect(formatDuration(90)).toBe('1h 30min');
  });
});
