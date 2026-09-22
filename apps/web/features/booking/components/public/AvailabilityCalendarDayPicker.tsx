import {
  type ChevronProps,
  type DayButtonProps,
  type NextMonthButtonProps,
  type PreviousMonthButtonProps,
} from 'react-day-picker';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/shared/utils/cn';

// Inline styles (not Tailwind arbitrary-value classes) — same technique AvailabilityCarousel
// uses for its selected/unselected day styling, and required here so --ba-* values are
// assertable via toHaveStyle() in jsdom, which never resolves Tailwind's JIT classes to computed
// styles.
function getDayButtonStyle(modifiers: DayButtonProps['modifiers']): React.CSSProperties {
  if (modifiers.selected) {
    return {
      backgroundColor: 'var(--ba-primary, #2563eb)',
      color: 'var(--ba-btn-text, #ffffff)',
      boxShadow: 'var(--ba-shadow, 0 1px 3px rgba(0,0,0,0.10))',
    };
  }
  if (modifiers.disabled || modifiers.outOfRange) {
    // Deliberately not a --ba-* token: --ba-secondary is a light *background* tint by design
    // (used as backgroundColor everywhere else below), and using it as *text* color here made
    // disabled days unreadable for tenants with a pale secondary color. A disabled/muted day is
    // an inherently de-emphasized, non-branded state — same reasoning the shared dashboard
    // Calendar already follows for its own disabled modifier (plain gray, no brand token).
    return {
      backgroundColor: 'transparent',
      color: '#9ca3af',
      opacity: 0.6,
      cursor: 'not-allowed',
    };
  }
  if (modifiers.today) {
    return {
      backgroundColor: 'var(--ba-secondary, rgb(239 246 255))',
      color: 'var(--ba-primary, #1d4ed8)',
      boxShadow: 'inset 0 0 0 2px var(--ba-primary, #2563eb)',
    };
  }
  return {
    backgroundColor: 'var(--ba-secondary, rgb(239 246 255))',
    color: 'var(--ba-primary, #1d4ed8)',
  };
}

function CalendarDayButton({ day, modifiers, style, ...rest }: DayButtonProps): React.JSX.Element {
  return (
    <button
      {...rest}
      type="button"
      data-testid="calendar-day"
      data-date={day.isoDate}
      className="flex h-9 w-9 items-center justify-center text-base font-semibold transition-opacity hover:opacity-80"
      style={{ ...style, borderRadius: 'var(--ba-radius)', ...getDayButtonStyle(modifiers) }}
    >
      {day.date.getDate()}
    </button>
  );
}

function CalendarChevron({
  className,
  orientation,
  disabled: _disabled,
  size: _size,
  ...rest
}: Readonly<ChevronProps>): React.JSX.Element {
  const Icon = orientation === 'right' ? ChevronRight : ChevronLeft;
  return <Icon className={cn('h-4 w-4', className)} {...rest} />;
}

function CalendarPreviousMonthButton(props: Readonly<PreviousMonthButtonProps>): React.JSX.Element {
  return <button {...props} type="button" data-testid="calendar-previous-month" />;
}

function CalendarNextMonthButton(props: Readonly<NextMonthButtonProps>): React.JSX.Element {
  return <button {...props} type="button" data-testid="calendar-next-month" />;
}

export const DAY_PICKER_COMPONENTS = {
  DayButton: CalendarDayButton,
  Chevron: CalendarChevron,
  PreviousMonthButton: CalendarPreviousMonthButton,
  NextMonthButton: CalendarNextMonthButton,
};
