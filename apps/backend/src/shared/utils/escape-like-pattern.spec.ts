import { escapeLikePattern } from './escape-like-pattern';

describe('escapeLikePattern', () => {
  it('returns the input unchanged when it has no LIKE special characters', () => {
    expect(escapeLikePattern('casado')).toBe('casado');
  });

  it('escapes a literal percent sign', () => {
    expect(escapeLikePattern('100%')).toBe('100\\%');
  });

  it('escapes a literal underscore', () => {
    expect(escapeLikePattern('a_b')).toBe('a\\_b');
  });

  it('escapes a literal backslash', () => {
    expect(escapeLikePattern('a\\b')).toBe('a\\\\b');
  });

  it('escapes a wildcard-only input, preventing an unselective full-table pattern', () => {
    expect(escapeLikePattern('%%%')).toBe('\\%\\%\\%');
    expect(escapeLikePattern('___')).toBe('\\_\\_\\_');
  });

  it('escapes multiple special characters together', () => {
    expect(escapeLikePattern('%_\\test')).toBe('\\%\\_\\\\test');
  });
});
