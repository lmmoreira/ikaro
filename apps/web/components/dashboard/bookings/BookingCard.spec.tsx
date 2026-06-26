// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { StaffBookingCardResponse } from '@ikaro/types';
import { BookingCard } from './BookingCard';

vi.mock('@/lib/formatting/use-formatting', () => ({
  useFormatting: () => ({
    formatMoney: (amount: number) => `R$ ${amount.toFixed(2)}`,
    formatTime: (date: Date) => date.toISOString().slice(11, 16),
    formatDateLong: (_date: Date) => 'Qui, 18 de junho',
  }),
}));

vi.mock('next/link', () => ({
  default: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => (
    <a href={href} className={className}>{children}</a>
  ),
}));

vi.mock('@/components/ui/badge', () => ({
  Badge: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <span className={className} data-testid="badge">{children}</span>
  ),
}));

vi.mock('@/components/ui/card', () => ({
  Card: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div className={className} data-testid="card">{children}</div>
  ),
  CardContent: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div className={className}>{children}</div>
  ),
}));

function makeBooking(overrides?: Partial<StaffBookingCardResponse>): StaffBookingCardResponse {
  return {
    bookingId: 'b-001',
    status: 'PENDING',
    scheduledAt: '2026-06-26T10:00:00.000Z',
    contactName: 'Maria Silva',
    serviceNames: ['Lavagem', 'Enceramento'],
    totalPrice: { amount: 150, currency: 'BRL' },
    totalDurationMins: 90,
    isCustomer: true,
    ...overrides,
  };
}

describe('BookingCard — action-needed variant', () => {
  it('renders contact name', () => {
    render(<BookingCard booking={makeBooking()} variant="action-needed" />);
    expect(screen.getByText('Maria Silva')).toBeInTheDocument();
  });

  it('renders service names joined by comma', () => {
    render(<BookingCard booking={makeBooking()} variant="action-needed" />);
    expect(screen.getByText('Lavagem, Enceramento')).toBeInTheDocument();
  });

  it('renders formatted price via formatMoney', () => {
    render(<BookingCard booking={makeBooking()} variant="action-needed" />);
    expect(screen.getByText(/R\$ 150\.00/)).toBeInTheDocument();
  });

  it('renders duration in human-readable format', () => {
    render(<BookingCard booking={makeBooking()} variant="action-needed" />);
    expect(screen.getByText(/1 h 30 min/)).toBeInTheDocument();
  });

  it('renders PENDING status badge with yellow classes', () => {
    render(<BookingCard booking={makeBooking()} variant="action-needed" />);
    const badge = screen.getByTestId('badge');
    expect(badge).toHaveTextContent('Pendente');
    expect(badge.className).toContain('bg-yellow-100');
  });

  it('renders Aprovar and Ver detalhes buttons', () => {
    render(<BookingCard booking={makeBooking()} variant="action-needed" />);
    expect(screen.getByRole('button', { name: 'Aprovar' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ver detalhes' })).toBeInTheDocument();
  });

  it('wraps card in a link to /dashboard/bookings/:id', () => {
    render(<BookingCard booking={makeBooking()} variant="action-needed" />);
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', '/dashboard/bookings/b-001');
  });

  it('INFO_REQUESTED card has blue-600 left border class', () => {
    render(<BookingCard booking={makeBooking({ status: 'INFO_REQUESTED' })} variant="action-needed" />);
    const card = screen.getByTestId('card');
    expect(card.className).toContain('border-l-blue-600');
  });

  it('PENDING card does NOT have the blue left border', () => {
    render(<BookingCard booking={makeBooking()} variant="action-needed" />);
    const card = screen.getByTestId('card');
    expect(card.className).not.toContain('border-l-blue-600');
  });
});

describe('BookingCard — today variant', () => {
  it('shows "Marcar concluído" button instead of Aprovar', () => {
    render(<BookingCard booking={makeBooking({ status: 'APPROVED' })} variant="today" />);
    expect(screen.getByRole('button', { name: 'Marcar concluído' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Aprovar' })).not.toBeInTheDocument();
  });

  it('wraps card in a link to booking detail', () => {
    render(<BookingCard booking={makeBooking({ status: 'APPROVED' })} variant="today" />);
    expect(screen.getByRole('link')).toHaveAttribute('href', '/dashboard/bookings/b-001');
  });
});

describe('BookingCard — upcoming variant', () => {
  it('renders with opacity-70 class', () => {
    render(<BookingCard booking={makeBooking({ status: 'APPROVED' })} variant="upcoming" />);
    expect(screen.getByTestId('card').className).toContain('opacity-70');
  });

  it('does NOT render a link', () => {
    render(<BookingCard booking={makeBooking({ status: 'APPROVED' })} variant="upcoming" />);
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('does NOT render any action buttons', () => {
    render(<BookingCard booking={makeBooking({ status: 'APPROVED' })} variant="upcoming" />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});

describe('BookingCard — contact name truncation', () => {
  it('contactName element has truncate class', () => {
    render(<BookingCard booking={makeBooking()} variant="action-needed" />);
    const name = screen.getByText('Maria Silva');
    expect(name.className).toContain('truncate');
  });
});
