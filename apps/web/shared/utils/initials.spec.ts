import { describe, expect, it } from 'vitest';
import { getInitials } from '@/shared/utils/initials';

describe('getInitials', () => {
  it('returns first and last initial for a two-word name', () => {
    expect(getInitials('Ana Pereira')).toBe('AP');
  });

  it('returns only first initial for a single-word name', () => {
    expect(getInitials('Carlos')).toBe('C');
  });

  it('uses first and last word for names with more than two parts', () => {
    expect(getInitials('Maria das Graças')).toBe('MG');
  });

  it('uppercases the result', () => {
    expect(getInitials('joão silva')).toBe('JS');
  });

  it('trims leading and trailing whitespace', () => {
    expect(getInitials('  Ana Silva  ')).toBe('AS');
  });

  it('collapses internal whitespace between words', () => {
    expect(getInitials('Ana  Silva')).toBe('AS');
  });

  it('returns "?" for null', () => {
    expect(getInitials(null)).toBe('?');
  });

  it('returns "?" for an empty string', () => {
    expect(getInitials('')).toBe('?');
  });

  it('returns "?" for a whitespace-only string', () => {
    expect(getInitials('   ')).toBe('?');
  });
});
