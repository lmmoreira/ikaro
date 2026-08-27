import { describe, expect, it } from 'vitest';
import { buildLeadsSearchQuery, isSearchTermValid, parseLeadFormFilters } from './lead-form-search';

describe('isSearchTermValid', () => {
  it('rejects a term under 3 characters (trimmed)', () => {
    expect(isSearchTermValid('')).toBe(false);
    expect(isSearchTermValid('a')).toBe(false);
    expect(isSearchTermValid('ab')).toBe(false);
    expect(isSearchTermValid('  ab  ')).toBe(false);
  });

  it('accepts a term of 3 or more characters (trimmed)', () => {
    expect(isSearchTermValid('abc')).toBe(true);
    expect(isSearchTermValid('  abc  ')).toBe(true);
  });
});

describe('parseLeadFormFilters', () => {
  it('returns undefined for an absent value', () => {
    expect(parseLeadFormFilters(undefined)).toBeUndefined();
  });

  it('parses a valid JSON array of filter entries', () => {
    const raw = JSON.stringify([{ questionLabel: 'Estado civil', value: 'casado' }]);
    expect(parseLeadFormFilters(raw)).toEqual([{ questionLabel: 'Estado civil', value: 'casado' }]);
  });

  it('returns undefined for malformed JSON', () => {
    expect(parseLeadFormFilters('{not json')).toBeUndefined();
  });

  it('returns undefined when the parsed value is not an array', () => {
    expect(
      parseLeadFormFilters(JSON.stringify({ questionLabel: 'x', value: 'y' })),
    ).toBeUndefined();
  });

  it('drops entries missing questionLabel/value and returns undefined if none remain', () => {
    const raw = JSON.stringify([{ questionLabel: 'x' }, { value: 'y' }]);
    expect(parseLeadFormFilters(raw)).toBeUndefined();
  });

  it('filters out malformed entries but keeps the valid ones', () => {
    const raw = JSON.stringify([
      { questionLabel: 'Estado civil', value: 'casado' },
      { questionLabel: 'x' },
    ]);
    expect(parseLeadFormFilters(raw)).toEqual([{ questionLabel: 'Estado civil', value: 'casado' }]);
  });

  it('returns undefined for an empty array', () => {
    expect(parseLeadFormFilters('[]')).toBeUndefined();
  });
});

describe('buildLeadsSearchQuery', () => {
  it('returns an empty string when nothing is active', () => {
    expect(buildLeadsSearchQuery({})).toBe('');
  });

  it('builds a search query', () => {
    expect(buildLeadsSearchQuery({ search: 'carlos' })).toBe('?search=carlos');
  });

  it('builds a filters query as a JSON-encoded array', () => {
    const filters = [{ questionLabel: 'Estado civil', value: 'casado' }];
    const result = buildLeadsSearchQuery({ filters });
    const expectedQuery = new URLSearchParams({ filters: JSON.stringify(filters) }).toString();
    expect(result).toBe(`?${expectedQuery}`);
  });

  it('omits an empty filters array', () => {
    expect(buildLeadsSearchQuery({ filters: [] })).toBe('');
  });

  it('builds a date range query', () => {
    expect(buildLeadsSearchQuery({ submittedFrom: '2026-08-01', submittedTo: '2026-08-15' })).toBe(
      '?submittedFrom=2026-08-01&submittedTo=2026-08-15',
    );
  });

  it('omits page when it is 1 or undefined', () => {
    expect(buildLeadsSearchQuery({ search: 'carlos', page: 1 })).toBe('?search=carlos');
    expect(buildLeadsSearchQuery({ search: 'carlos' })).toBe('?search=carlos');
  });

  it('includes page when greater than 1', () => {
    expect(buildLeadsSearchQuery({ search: 'carlos', page: 2 })).toBe('?search=carlos&page=2');
  });

  it('combines search, date range, and page together', () => {
    const result = buildLeadsSearchQuery({
      search: 'carlos',
      submittedFrom: '2026-08-01',
      submittedTo: '2026-08-15',
      page: 3,
    });
    expect(result).toBe('?search=carlos&submittedFrom=2026-08-01&submittedTo=2026-08-15&page=3');
  });
});
