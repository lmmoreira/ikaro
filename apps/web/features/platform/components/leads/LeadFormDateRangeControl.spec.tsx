// @vitest-environment jsdom
import { useState } from 'react';
import { fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWithIntl } from '@/test-utils';
import { LeadFormDateRangeControl, type LeadFormDateRangeValue } from './LeadFormDateRangeControl';

function clickDay(isoDate: string): void {
  const cell = document.querySelector(`[data-day="${isoDate}"] button`);
  if (!cell) throw new Error(`day cell for ${isoDate} not found`);
  fireEvent.click(cell);
}

// The component renders no `month`/`defaultMonth` prop, so react-day-picker defaults to
// today's real month + the next one (numberOfMonths={2}). A hardcoded calendar date would
// silently stop being visible in that window once real time moves past it — computing relative
// to Date.now() instead is the same fix this repo already applies to test-builder date defaults
// (CLAUDE.md § Shared test-builder date defaults). +10 days is always within the 2-month
// forward window regardless of today's day-of-month.
// Local-getter-only, matching the component's own toLocalISODate — `.toISOString()` would
// reinterpret the local day through UTC, the exact bug this test exists to catch (a real CI
// failure showed this shifting the reported day by one on GitHub's UTC runners).
function isoDateDaysFromNow(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// A real caller (LeadFormSearchPanel) keeps `value` in state and re-renders with the previous
// selection fed back in — required for react-day-picker's range mode to extend an existing
// range on a second click rather than starting a fresh one every time.
function ControlledHarness({
  onChange,
}: {
  readonly onChange: (value: LeadFormDateRangeValue) => void;
}): React.JSX.Element {
  const [value, setValue] = useState<LeadFormDateRangeValue>({});
  return (
    <LeadFormDateRangeControl
      value={value}
      onChange={(next) => {
        setValue(next);
        onChange(next);
      }}
      placeholder="Selecionar"
    />
  );
}

describe('LeadFormDateRangeControl', () => {
  it('shows the placeholder when no range is set', () => {
    renderWithIntl(
      <LeadFormDateRangeControl value={{}} onChange={vi.fn()} placeholder="Selecionar período" />,
    );

    expect(screen.getByTestId('leads-date-range-trigger')).toHaveTextContent('Selecionar período');
  });

  it('shows a single formatted date when only "from" is set', () => {
    renderWithIntl(
      <LeadFormDateRangeControl
        value={{ from: '2026-08-10' }}
        onChange={vi.fn()}
        placeholder="Selecionar período"
      />,
    );

    expect(screen.getByTestId('leads-date-range-trigger')).toHaveTextContent('10 de agosto');
  });

  it('shows the full range when both dates are set', () => {
    renderWithIntl(
      <LeadFormDateRangeControl
        value={{ from: '2026-08-01', to: '2026-08-15' }}
        onChange={vi.fn()}
        placeholder="Selecionar período"
      />,
    );

    const trigger = screen.getByTestId('leads-date-range-trigger');
    expect(trigger).toHaveTextContent('1 de agosto');
    expect(trigger).toHaveTextContent('15 de agosto');
  });

  it('opens the calendar popover and reports a picked range via onChange', async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();
    renderWithIntl(<ControlledHarness onChange={handleChange} />);

    await user.click(screen.getByTestId('leads-date-range-trigger'));
    const dialog = await screen.findByRole('grid', {}, { timeout: 2000 }).catch(() => null);
    expect(dialog ?? document.querySelector('[data-day]')).toBeTruthy();

    // react-day-picker's range mode resolves a single click into a complete 1-day range —
    // the first click alone is already a valid {from, to} pair (see addToRange.js). A second
    // click on a later day then extends `to`, but only because ControlledHarness feeds the
    // first click's result back in as `value` before the second click runs.
    const firstDay = isoDateDaysFromNow(3);
    const secondDay = isoDateDaysFromNow(10);
    clickDay(firstDay);
    expect(handleChange).toHaveBeenLastCalledWith({ from: firstDay, to: firstDay });

    clickDay(secondDay);
    expect(handleChange).toHaveBeenLastCalledWith({ from: firstDay, to: secondDay });
  });

  it('renders two months so a cross-month range is selectable in one open', async () => {
    const user = userEvent.setup();
    renderWithIntl(
      <LeadFormDateRangeControl value={{}} onChange={vi.fn()} placeholder="Selecionar" />,
    );

    await user.click(screen.getByTestId('leads-date-range-trigger'));
    const grids = within(document.body).getAllByRole('grid');
    expect(grids.length).toBeGreaterThanOrEqual(2);
  });
});
