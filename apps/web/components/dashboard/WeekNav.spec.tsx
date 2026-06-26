// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { WeekNav } from './WeekNav';

const monday = new Date('2026-06-22T00:00:00'); // Monday of a week in June 2026

describe('WeekNav', () => {
  it('renders a month/year label for the start of week', () => {
    render(<WeekNav startOfWeek={monday} onPrev={vi.fn()} onNext={vi.fn()} />);
    expect(screen.getByTestId('week-nav-label')).toHaveTextContent('Junho 2026');
  });

  it('calls onPrev when the ‹ button is clicked', async () => {
    const onPrev = vi.fn();
    render(<WeekNav startOfWeek={monday} onPrev={onPrev} onNext={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Semana anterior' }));
    expect(onPrev).toHaveBeenCalledOnce();
  });

  it('calls onNext when the › button is clicked', async () => {
    const onNext = vi.fn();
    render(<WeekNav startOfWeek={monday} onPrev={vi.fn()} onNext={onNext} />);
    await userEvent.click(screen.getByRole('button', { name: 'Próxima semana' }));
    expect(onNext).toHaveBeenCalledOnce();
  });

  it('disables the ‹ button when disablePrev is true', () => {
    render(<WeekNav startOfWeek={monday} onPrev={vi.fn()} onNext={vi.fn()} disablePrev />);
    expect(screen.getByRole('button', { name: 'Semana anterior' })).toBeDisabled();
  });

  it('disables the › button when disableNext is true', () => {
    render(<WeekNav startOfWeek={monday} onPrev={vi.fn()} onNext={vi.fn()} disableNext />);
    expect(screen.getByRole('button', { name: 'Próxima semana' })).toBeDisabled();
  });

  it('does not disable buttons by default', () => {
    render(<WeekNav startOfWeek={monday} onPrev={vi.fn()} onNext={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Semana anterior' })).not.toBeDisabled();
    expect(screen.getByRole('button', { name: 'Próxima semana' })).not.toBeDisabled();
  });
});
