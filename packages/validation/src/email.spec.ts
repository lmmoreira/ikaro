import { isValidEmail } from './email';

describe('isValidEmail', () => {
  it('accepts a well-formed address', () => {
    expect(isValidEmail('joao@example.com')).toBe(true);
  });

  it('rejects a value with no @', () => {
    expect(isValidEmail('joaoexample.com')).toBe(false);
  });

  it('rejects a value with @ as the first character', () => {
    expect(isValidEmail('@example.com')).toBe(false);
  });

  it('rejects a domain with no dot', () => {
    expect(isValidEmail('joao@examplecom')).toBe(false);
  });

  it('rejects a domain ending in a dot', () => {
    expect(isValidEmail('joao@example.')).toBe(false);
  });

  it('rejects an empty domain', () => {
    expect(isValidEmail('joao@')).toBe(false);
  });
});
