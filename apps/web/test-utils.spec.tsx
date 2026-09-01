// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { getPillOption, queryPillOption, renderWithIntl } from './test-utils';

// getPillOption/queryPillOption are exercised indirectly by every PillSelect-consuming component
// spec, but the "no match found" paths aren't — direct coverage for those here.
describe('getPillOption / queryPillOption', () => {
  it('getPillOption throws a clear error when no option matches', () => {
    renderWithIntl(<div data-testid="group" data-value="a" />);

    expect(() => getPillOption('group', 'b')).toThrow(
      'No PillSelect option found for testId="group" value="b"',
    );
  });

  it('queryPillOption returns null when no option matches', () => {
    renderWithIntl(<div data-testid="group" data-value="a" />);

    expect(queryPillOption('group', 'b')).toBeNull();
  });
});
