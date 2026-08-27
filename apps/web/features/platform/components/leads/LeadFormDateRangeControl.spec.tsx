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
    clickDay('2026-08-10');
    expect(handleChange).toHaveBeenLastCalledWith({ from: '2026-08-10', to: '2026-08-10' });

    clickDay('2026-08-15');
    expect(handleChange).toHaveBeenLastCalledWith({ from: '2026-08-10', to: '2026-08-15' });
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
