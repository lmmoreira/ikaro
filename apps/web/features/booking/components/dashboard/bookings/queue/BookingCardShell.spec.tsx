// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { BookingCardShell } from './BookingCardShell';

vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    className,
    'aria-label': ariaLabel,
  }: {
    href: string;
    children?: React.ReactNode;
    className?: string;
    'aria-label'?: string;
  }) => (
    <a href={href} className={className} aria-label={ariaLabel}>
      {children}
    </a>
  ),
}));

const base = {
  href: '/dashboard/bookings/b-1',
  linkAriaLabel: 'Ver detalhes do agendamento de Ana',
  name: 'Ana',
  badges: <span>Cliente</span>,
  serviceLine: 'Lavagem Simples',
  timeLabel: 'Hoje · 10:00',
  priceLabel: 'R$ 60,00 · 30min',
} as const;

describe('BookingCardShell', () => {
  it('renders the name, the pills, the service line and the time and price rows', () => {
    render(<BookingCardShell {...base} />);

    expect(screen.getByText('Ana')).toBeInTheDocument();
    expect(screen.getByText('Cliente')).toBeInTheDocument();
    expect(screen.getByText('Lavagem Simples')).toBeInTheDocument();
    expect(screen.getByText('Hoje · 10:00')).toBeInTheDocument();
    expect(screen.getByText('R$ 60,00 · 30min')).toBeInTheDocument();
  });

  it('makes the whole card a link to the booking detail', () => {
    render(<BookingCardShell {...base} />);

    const link = screen.getByRole('link', { name: 'Ver detalhes do agendamento de Ana' });
    expect(link).toHaveAttribute('href', '/dashboard/bookings/b-1');
    expect(link).toHaveClass('absolute', 'inset-0', 'z-10');
  });

  it('puts the leading control and the actions above the link, so clicking them never opens the detail', () => {
    render(
      <BookingCardShell
        {...base}
        leading={<input type="checkbox" aria-label="Selecionar" />}
        actions={<button type="button">Aprovar</button>}
      />,
    );

    expect(screen.getByLabelText('Selecionar').parentElement).toHaveClass('relative', 'z-20');
    expect(screen.getByRole('button', { name: 'Aprovar' }).parentElement).toHaveClass(
      'relative',
      'z-20',
    );
  });

  it('renders nothing for the optional slots when they are omitted', () => {
    const { container } = render(<BookingCardShell {...base} />);

    expect(container.querySelector('.z-20')).toBeNull();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('renders the extra lines between the time row and the actions, and applies the card class', () => {
    const { container } = render(
      <BookingCardShell {...base} className="mb-3 border-blue-500">
        <p>Box 2 desativado</p>
      </BookingCardShell>,
    );

    expect(screen.getByText('Box 2 desativado')).toBeInTheDocument();
    expect(container.querySelector('.border-blue-500')).not.toBeNull();
  });
});
