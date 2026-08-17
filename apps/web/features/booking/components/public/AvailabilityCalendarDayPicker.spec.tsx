// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DayPicker } from 'react-day-picker';
import { describe, expect, it } from 'vitest';
import { DAY_PICKER_COMPONENTS } from './AvailabilityCalendarDayPicker';

// Exercises DAY_PICKER_COMPONENTS through a real react-day-picker <DayPicker> instance (mirrors
// how AvailabilityCalendar.tsx wires it up) rather than hand-fabricating DayButtonProps/
// ChevronProps — react-day-picker's internal prop shapes are non-trivial to fake accurately.

function renderCalendar(overrides?: {
  readonly selected?: Date;
  readonly disabled?: (date: Date) => boolean;
}): ReturnType<typeof render> {
  return render(
    <DayPicker
      mode="single"
      defaultMonth={new Date('2026-06-15T00:00:00')}
      selected={overrides?.selected}
      disabled={overrides?.disabled}
      components={DAY_PICKER_COMPONENTS}
    />,
  );
}

describe('AvailabilityCalendarDayPicker (DAY_PICKER_COMPONENTS)', () => {
  it('renders a data-testid="calendar-day" button per visible day with a data-date attribute', () => {
    renderCalendar();

    const days = screen.getAllByTestId('calendar-day');
    expect(days.length).toBeGreaterThan(27);
    expect(days[0]).toHaveAttribute('data-date');
  });

  it('renders the day number as the button label', () => {
    renderCalendar();

    const day15 = screen.getAllByTestId('calendar-day').find((el) => el.textContent === '15');
    expect(day15).toBeDefined();
  });

  it('applies the selected style to the selected day', () => {
    renderCalendar({ selected: new Date('2026-06-15T00:00:00') });

    const selectedDay = screen
      .getAllByTestId('calendar-day')
      .find((el) => el.getAttribute('data-date')?.startsWith('2026-06-15'));
    expect(selectedDay).toHaveStyle({ color: 'var(--ba-btn-text, #ffffff)' });
  });

  it('applies the disabled style and disables the button for a disabled day', () => {
    renderCalendar({ disabled: (date) => date.getDate() === 20 });

    const disabledDay = screen
      .getAllByTestId('calendar-day')
      .find((el) => el.getAttribute('data-date')?.startsWith('2026-06-20'));
    expect(disabledDay).toBeDisabled();
    expect(disabledDay).toHaveStyle({ cursor: 'not-allowed' });
  });

  it('renders previous/next month navigation buttons and advances the month on click', async () => {
    const user = userEvent.setup();
    renderCalendar();

    expect(screen.getByTestId('calendar-previous-month')).toBeInTheDocument();
    const nextButton = screen.getByTestId('calendar-next-month');
    expect(nextButton).toBeInTheDocument();

    await user.click(nextButton);

    // After advancing from June 2026, at least one visible day now falls in July.
    const dates = screen.getAllByTestId('calendar-day').map((el) => el.getAttribute('data-date'));
    expect(dates.some((date) => date?.startsWith('2026-07'))).toBe(true);
  });
});
