// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { TimelineBlockShell } from './TimelineBlockShell';

describe('TimelineBlockShell', () => {
  it('renders a link when href is provided', () => {
    render(
      <TimelineBlockShell
        compact={false}
        className="test-class"
        style={{ top: '0px', height: '48px' }}
        href="/dashboard/bookings/abc"
        ariaLabel="João Silva"
        title="João Silva"
        subtitle="Lavagem completa"
      />,
    );

    const link = screen.getByRole('link', { name: 'João Silva' });
    expect(link).toHaveAttribute('href', '/dashboard/bookings/abc');
    expect(screen.getByText('Lavagem completa')).toBeInTheDocument();
  });

  it('renders a button and calls onClick when href is absent', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();

    render(
      <TimelineBlockShell
        compact={false}
        className="test-class"
        style={{ top: '0px', height: '48px' }}
        onClick={onClick}
        title="Fechado para manutenção"
        subtitle="09:00–10:00"
      />,
    );

    const button = screen.getByRole('button', { name: /Fechado para manutenção/ });
    await user.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('renders icon, trailing, and footer content when provided', () => {
    render(
      <TimelineBlockShell
        compact
        className="test-class"
        style={{}}
        title="Título"
        subtitle="Subtítulo"
        icon={<span data-testid="block-icon" />}
        trailing={<span data-testid="block-trailing" />}
        footer={<span data-testid="block-footer" />}
      />,
    );

    expect(screen.getByTestId('block-icon')).toBeInTheDocument();
    expect(screen.getByTestId('block-trailing')).toBeInTheDocument();
    expect(screen.getByTestId('block-footer')).toBeInTheDocument();
  });

  it('renders the testId as data-testid on the link variant', () => {
    render(
      <TimelineBlockShell
        compact={false}
        className="test-class"
        style={{}}
        href="/dashboard/bookings/abc"
        testId="schedule-booking-block-abc"
        title="João Silva"
        subtitle="Lavagem completa"
      />,
    );

    expect(screen.getByTestId('schedule-booking-block-abc')).toBeInTheDocument();
  });

  it('renders the testId as data-testid on the button variant', () => {
    render(
      <TimelineBlockShell
        compact={false}
        className="test-class"
        style={{}}
        testId="schedule-closure-block-abc"
        title="Fechado para manutenção"
        subtitle="09:00–10:00"
      />,
    );

    expect(screen.getByTestId('schedule-closure-block-abc')).toBeInTheDocument();
  });
});
