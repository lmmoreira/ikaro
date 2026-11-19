import { secretsMatch } from './timing-safe-secret';

describe('secretsMatch', () => {
  it('matches equal secrets', () => {
    expect(secretsMatch('s3cret-value', 's3cret-value')).toBe(true);
  });

  it.each([
    ['a different secret of the same length', 's3cret-valuX'],
    ['a secret of another length', 's3cret'],
    ['an empty secret', ''],
    ['a missing secret', undefined],
  ])('refuses %s', (_label, received) => {
    expect(secretsMatch('s3cret-value', received)).toBe(false);
  });

  it('fails closed when the expected secret is unset or empty, even for a matching empty value', () => {
    expect(secretsMatch(undefined, 'anything')).toBe(false);
    expect(secretsMatch('', '')).toBe(false);
  });
});
