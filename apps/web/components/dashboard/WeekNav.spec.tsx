// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { WeekNav } from './WeekNav';

const windowStart = new Date('2026-06-16T00:00:00');
const today = new Date('2026-06-16T00:00:00');

describe('WeekNav — header', () => {
  it('renders the month/year label for windowStart', () => {
    render(
      <WeekNav
        windowStart={windowStart}
        windowDays={7}
        today={today}
        onPrev={vi.fn()}
        onNext={vi.fn()}
      />,
    );
    expect(screen.getByTestId('week-nav-label')).toHaveTextContent('Junho 2026');
  });

  it('calls onPrev when the ‹ button is clicked', async () => {
    const onPrev = vi.fn();
    render(
      <WeekNav
        windowStart={windowStart}
        windowDays={7}
        today={today}
        onPrev={onPrev}
        onNext={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Período anterior' }));
    expect(onPrev).toHaveBeenCalledOnce();
  });

  it('calls onNext when the › button is clicked', async () => {
    const onNext = vi.fn();
    render(
      <WeekNav
        windowStart={windowStart}
        windowDays={7}
        today={today}
        onPrev={vi.fn()}
        onNext={onNext}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Próximo período' }));
    expect(onNext).toHaveBeenCalledOnce();
  });

  it('disables the ‹ button when disablePrev is true', () => {
    render(
      <WeekNav
        windowStart={windowStart}
        windowDays={7}
        today={today}
        onPrev={vi.fn()}
        onNext={vi.fn()}
        disablePrev
      />,
    );
    expect(screen.getByRole('button', { name: 'Período anterior' })).toBeDisabled();
  });

  it('disables the › button when disableNext is true', () => {
    render(
      <WeekNav
        windowStart={windowStart}
        windowDays={7}
        today={today}
        onPrev={vi.fn()}
        onNext={vi.fn()}
        disableNext
      />,
    );
    expect(screen.getByRole('button', { name: 'Próximo período' })).toBeDisabled();
  });
});

describe('WeekNav — day strip', () => {
  it('renders exactly windowDays day pills', () => {
    render(
      <WeekNav
        windowStart={windowStart}
        windowDays={7}
        today={today}
        onPrev={vi.fn()}
        onNext={vi.fn()}
      />,
    );
    expect(screen.getAllByTestId('week-day')).toHaveLength(7);
  });

  it('renders 14 day pills when windowDays is 14', () => {
    render(
      <WeekNav
        windowStart={windowStart}
        windowDays={14}
        today={today}
        onPrev={vi.fn()}
        onNext={vi.fn()}
      />,
    );
    expect(screen.getAllByTestId('week-day')).toHaveLength(14);
  });

  it('marks today pill with data-today=true', () => {
    render(
      <WeekNav
        windowStart={windowStart}
        windowDays={7}
        today={today}
        onPrev={vi.fn()}
        onNext={vi.fn()}
      />,
    );
    const todayPill = screen
      .getAllByTestId('week-day')
      .find((el) => el.dataset.date === '2026-06-16');
    expect(todayPill).toHaveAttribute('data-today', 'true');
  });

  it('does not mark non-today pills with data-today', () => {
    render(
      <WeekNav
        windowStart={windowStart}
        windowDays={7}
        today={today}
        onPrev={vi.fn()}
        onNext={vi.fn()}
      />,
    );
    const nonTodayPill = screen
      .getAllByTestId('week-day')
      .find((el) => el.dataset.date === '2026-06-17');
    expect(nonTodayPill).not.toHaveAttribute('data-today');
  });

  it('shows day numbers for each date in the window', () => {
    render(
      <WeekNav
        windowStart={windowStart}
        windowDays={3}
        today={today}
        onPrev={vi.fn()}
        onNext={vi.fn()}
      />,
    );
    const pills = screen.getAllByTestId('week-day');
    expect(pills[0]).toHaveTextContent('16');
    expect(pills[1]).toHaveTextContent('17');
    expect(pills[2]).toHaveTextContent('18');
  });

  it('assigns data-date attributes to day pills', () => {
    render(
      <WeekNav
        windowStart={windowStart}
        windowDays={3}
        today={today}
        onPrev={vi.fn()}
        onNext={vi.fn()}
      />,
    );
    const pills = screen.getAllByTestId('week-day');
    expect(pills[0]).toHaveAttribute('data-date', '2026-06-16');
    expect(pills[1]).toHaveAttribute('data-date', '2026-06-17');
    expect(pills[2]).toHaveAttribute('data-date', '2026-06-18');
  });
});
