import { parseCommaSeparatedIds } from './parse-comma-separated-ids';

describe('parseCommaSeparatedIds', () => {
  it('splits a comma-separated string into trimmed ids', () => {
    expect(parseCommaSeparatedIds('a,b,c')).toEqual(['a', 'b', 'c']);
  });

  it('trims whitespace around each id', () => {
    expect(parseCommaSeparatedIds(' a , b ,c ')).toEqual(['a', 'b', 'c']);
  });

  it('drops empty entries caused by extra separators', () => {
    expect(parseCommaSeparatedIds('a,,b,')).toEqual(['a', 'b']);
  });

  it('returns an empty array for a string with only separators or whitespace', () => {
    expect(parseCommaSeparatedIds(',, ,')).toEqual([]);
  });

  it('returns a single-item array when there are no separators', () => {
    expect(parseCommaSeparatedIds('only-one')).toEqual(['only-one']);
  });
});
