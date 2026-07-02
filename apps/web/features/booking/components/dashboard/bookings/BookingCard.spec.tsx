// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { StaffBookingCardResponse } from '@ikaro/types';
import { BookingCard } from './BookingCard';

vi.mock('next-intl', () => ({
  useTranslations: (namespace: string) => {
    const translations: Record<string, Record<string, string>> = {
      'dashboard.bookingCard': {
        statusPending: 'Pendente',
        statusInfoRequested: 'Aguardando info',
        statusApproved: 'Aprovado',
        statusRejected: 'Rejeitado',
        statusCancelled: 'Cancelado',
        statusCompleted: 'Concluído',
        guestType: 'Visitante',
        customerType: 'Cliente',
        today: 'Hoje',
        tomorrow: 'Amanhã',
        markCompleted: 'Marcar concluído',
        approve: 'Aprovar',
        viewDetails: 'Ver detalhes',
        viewDetailsAriaLabel: 'Ver detalhes do agendamento de {name}',
      },
    };
    return (key: string, params?: Record<string, unknown>) => {
      const ns = translations[namespace] ?? {};
      let value = ns[key] ?? key;
      if (params) {
        for (const [k, v] of Object.entries(params)) {
          value = value.replace(`{${k}}`, String(v));
        }
      }
      return value;
    };
  },
}));

vi.mock('@/shared/lib/formatting/use-formatting', () => ({
  useFormatting: () => ({
    timezone: 'America/Sao_Paulo',
    formatMoney: (amount: number) => `R$ ${amount.toFixed(2)}`,
    formatTime: (date: Date) => date.toISOString().slice(11, 16),
    formatDateLong: (_date: Date) => 'Qui, 18 de junho',
  }),
}));

vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    className,
  }: {
    href: string;
    children: React.ReactNode;
    className?: string;
  }) => (
    <a
      href={href}
      className={className}
      style={{ pointerEvents: 'none' }}
      onClick={(event) => {
        event.preventDefault();
      }}
    >
      {children}
    </a>
  ),
}));

vi.mock('@/shared/components/ui/badge', () => ({
  Badge: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <span className={className} data-testid="badge">
      {children}
    </span>
  ),
}));

vi.mock('@/shared/components/ui/card', () => ({
  Card: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div className={className} data-testid="card">
      {children}
    </div>
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
    render(<BookingCard booking={makeBooking()} variant="action-needed" onApprove={() => {}} />);
    expect(screen.getByText('Maria Silva')).toBeInTheDocument();
  });

  it('renders service names joined by comma', () => {
    render(<BookingCard booking={makeBooking()} variant="action-needed" onApprove={() => {}} />);
    expect(screen.getByText('Lavagem, Enceramento')).toBeInTheDocument();
  });

  it('renders formatted price via formatMoney', () => {
    render(<BookingCard booking={makeBooking()} variant="action-needed" onApprove={() => {}} />);
    expect(screen.getByText(/R\$ 150\.00/)).toBeInTheDocument();
  });

  it('renders duration in human-readable format', () => {
    render(<BookingCard booking={makeBooking()} variant="action-needed" onApprove={() => {}} />);
    expect(screen.getByText(/1h 30min/)).toBeInTheDocument();
  });

  it('renders PENDING status badge with yellow classes', () => {
    render(<BookingCard booking={makeBooking()} variant="action-needed" onApprove={() => {}} />);
    const badges = screen.getAllByTestId('badge');
    expect(badges).toHaveLength(2);
    expect(badges[0]).toHaveTextContent('Cliente');
    expect(badges[0].className).toContain('bg-blue-100');
    expect(badges[1]).toHaveTextContent('Pendente');
    expect(badges[1].className).toContain('bg-yellow-100');
  });

  it('renders the guest badge when the booking is from a visitor', () => {
    render(
      <BookingCard
        booking={makeBooking({ isCustomer: false })}
        variant="action-needed"
        onApprove={() => {}}
      />,
    );
    const badges = screen.getAllByTestId('badge');
    expect(badges).toHaveLength(2);
    expect(badges[0]).toHaveTextContent('Visitante');
    expect(badges[0].className).toContain('bg-amber-100');
  });

  it('renders the Aprovar button without a Ver detalhes action', () => {
    render(<BookingCard booking={makeBooking()} variant="action-needed" onApprove={() => {}} />);
    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAttribute('href', '/dashboard/bookings/b-001');
    expect(screen.getByRole('button', { name: 'Aprovar' })).toBeInTheDocument();
  });

  it('wraps card in a link to /dashboard/bookings/:id', () => {
    render(<BookingCard booking={makeBooking()} variant="action-needed" onApprove={() => {}} />);
    expect(screen.getAllByRole('link')[0]).toHaveAttribute('href', '/dashboard/bookings/b-001');
  });

  it('INFO_REQUESTED card has blue-600 left border class', () => {
    render(
      <BookingCard
        booking={makeBooking({ status: 'INFO_REQUESTED' })}
        variant="action-needed"
        onApprove={() => {}}
      />,
    );
    const card = screen.getByTestId('card');
    expect(card.className).toContain('border-l-blue-600');
  });

  it('PENDING card does NOT have the blue left border', () => {
    render(<BookingCard booking={makeBooking()} variant="action-needed" onApprove={() => {}} />);
    const card = screen.getByTestId('card');
    expect(card.className).not.toContain('border-l-blue-600');
  });
});

describe('BookingCard — today variant', () => {
  it('shows "Marcar concluído" button instead of Aprovar', () => {
    render(<BookingCard booking={makeBooking({ status: 'APPROVED' })} variant="today" />);
    expect(screen.getByRole('link', { name: 'Marcar concluído' })).toHaveAttribute(
      'href',
      '/dashboard/bookings/b-001/complete',
    );
    expect(screen.queryByRole('link', { name: 'Aprovar' })).not.toBeInTheDocument();
  });

  it('wraps card in a link to booking detail', () => {
    render(<BookingCard booking={makeBooking({ status: 'APPROVED' })} variant="today" />);
    expect(screen.getAllByRole('link')[0]).toHaveAttribute('href', '/dashboard/bookings/b-001');
  });
});

describe('BookingCard — upcoming variant', () => {
  it('renders with opacity-70 class', () => {
    render(<BookingCard booking={makeBooking({ status: 'APPROVED' })} variant="upcoming" />);
    expect(screen.getByTestId('card').className).toContain('opacity-70');
  });

  it('wraps the card in a link to booking detail', () => {
    render(<BookingCard booking={makeBooking({ status: 'APPROVED' })} variant="upcoming" />);
    expect(screen.getAllByRole('link')[0]).toHaveAttribute('href', '/dashboard/bookings/b-001');
  });

  it('does NOT render any action buttons', () => {
    render(<BookingCard booking={makeBooking({ status: 'APPROVED' })} variant="upcoming" />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});

describe('BookingCard — contact name truncation', () => {
  it('contactName element has truncate class', () => {
    render(<BookingCard booking={makeBooking()} variant="action-needed" onApprove={() => {}} />);
    const name = screen.getByText('Maria Silva');
    expect(name.className).toContain('truncate');
  });
});
