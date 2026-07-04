// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { CustomerBookingDetailResponse } from '@ikaro/types';
import { BookingDetailMain } from './BookingDetailMain';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) => {
    const translations: Record<string, string> = {
      pointsEarnedBanner: '+{points} pontos de fidelidade',
      dateTimeTitle: 'Data e horário',
      dateLabel: 'Data',
      timeLabel: 'Horário',
      timeWithDuration: '{time} — duração estimada {minutes} min',
      scheduledAtPending: 'A confirmar após aprovação',
      servicesTitle: 'Serviços',
      total: 'Total',
      totalCharged: 'Valor cobrado',
      quotedPrice: 'Cotado: {amount}',
      discountApplied: 'Desconto aplicado: {points} pts (−{amount})',
      notesTitle: 'Suas observações',
      yourResponseTitle: 'Sua resposta',
      beforePhotosTitle: 'Fotos antes do serviço',
      beforePhotoAlt: 'Foto {index} antes do serviço',
      afterPhotosTitle: 'Fotos após o serviço',
      afterPhotoAlt: 'Foto {index} após o serviço',
    };
    let value = translations[key] ?? key;
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        value = value.replace(`{${k}}`, String(v));
      }
    }
    return value;
  },
}));

vi.mock('@/shared/lib/formatting/use-formatting', () => ({
  useFormatting: () => ({
    formatMoney: (amount: number) => `R$ ${amount.toFixed(2)}`,
    formatTime: (date: Date) => date.toISOString().slice(11, 16),
    formatDateLong: () => 'Sábado, 20 de junho',
  }),
}));

function makeBooking(
  overrides: Partial<CustomerBookingDetailResponse> = {},
): CustomerBookingDetailResponse {
  return {
    bookingId: 'b1',
    status: 'APPROVED',
    scheduledAt: '2026-06-20T10:00:00.000Z',
    lines: [
      {
        lineId: 'l1',
        serviceName: 'Lavagem Completa',
        durationMinsAtBooking: 60,
        priceAtBooking: { amount: 180, currency: 'BRL' },
        actualPriceCharged: null,
      },
    ],
    totalPrice: { amount: 180, currency: 'BRL' },
    notes: null,
    cancellableUntil: null,
    infoRequestMessage: null,
    infoResponseMessage: null,
    beforeServicePhotoUrls: [],
    afterServicePhotoUrls: [],
    completedAt: null,
    totalActualPrice: null,
    discountPointsUsed: null,
    discountAmount: null,
    pointsEarned: null,
    ...overrides,
  };
}

describe('BookingDetailMain', () => {
  it('renders date, service lines and the quoted total', () => {
    render(<BookingDetailMain booking={makeBooking()} />);

    expect(screen.getByText('Sábado, 20 de junho')).toBeInTheDocument();
    expect(screen.getByText('Lavagem Completa')).toBeInTheDocument();
    // The single line's price and the total both render R$ 180.00.
    expect(screen.getAllByText('R$ 180.00')).toHaveLength(2);
  });

  it('renders separate Data and Horário rows with the estimated duration', () => {
    render(<BookingDetailMain booking={makeBooking()} />);

    expect(screen.getByText('Data')).toBeInTheDocument();
    expect(screen.getByText('Horário')).toBeInTheDocument();
    expect(screen.getByText('10:00 — duração estimada 60 min')).toBeInTheDocument();
  });

  it('drops the duration suffix on the time row once COMPLETED', () => {
    render(<BookingDetailMain booking={makeBooking({ status: 'COMPLETED' })} />);

    expect(screen.getByText('10:00')).toBeInTheDocument();
    expect(screen.queryByText(/duração estimada/)).not.toBeInTheDocument();
  });

  it('shows "a confirmar" when scheduledAt is null', () => {
    render(<BookingDetailMain booking={makeBooking({ scheduledAt: null })} />);
    expect(screen.getByText('A confirmar após aprovação')).toBeInTheDocument();
  });

  it('hides the notes section when notes is null', () => {
    render(<BookingDetailMain booking={makeBooking({ notes: null })} />);
    expect(screen.queryByText('Suas observações')).not.toBeInTheDocument();
  });

  it('shows notes when present', () => {
    render(<BookingDetailMain booking={makeBooking({ notes: 'Carro sujo de lama' })} />);
    expect(screen.getByText('Suas observações')).toBeInTheDocument();
    expect(screen.getByText('Carro sujo de lama')).toBeInTheDocument();
  });

  it('hides before-photos grid when empty', () => {
    render(<BookingDetailMain booking={makeBooking({ beforeServicePhotoUrls: [] })} />);
    expect(screen.queryByText('Fotos antes do serviço')).not.toBeInTheDocument();
  });

  it('shows before-photos grid when present', () => {
    render(
      <BookingDetailMain
        booking={makeBooking({ beforeServicePhotoUrls: ['https://example.com/before.jpg'] })}
      />,
    );
    expect(screen.getByText('Fotos antes do serviço')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Foto 1 antes do serviço' })).toBeInTheDocument();
  });

  it('COMPLETED: shows charged price, discount and points-earned banner', () => {
    const booking = makeBooking({
      status: 'COMPLETED',
      totalPrice: { amount: 100, currency: 'BRL' },
      totalActualPrice: { amount: 76, currency: 'BRL' },
      discountPointsUsed: 240,
      discountAmount: { amount: 24, currency: 'BRL' },
      pointsEarned: 20,
      afterServicePhotoUrls: ['https://example.com/after.jpg'],
      lines: [
        {
          lineId: 'l1',
          serviceName: 'Lavagem Completa',
          durationMinsAtBooking: 60,
          priceAtBooking: { amount: 100, currency: 'BRL' },
          actualPriceCharged: { amount: 76, currency: 'BRL' },
        },
      ],
    });

    render(<BookingDetailMain booking={booking} />);

    expect(screen.getByText('+20 pontos de fidelidade')).toBeInTheDocument();
    expect(screen.getByText('Valor cobrado')).toBeInTheDocument();
    // Per-line charged price and the total both show R$ 76.00 for this single-line booking.
    expect(screen.getAllByText('R$ 76.00')).toHaveLength(2);
    expect(screen.getByText('Cotado: R$ 100.00')).toBeInTheDocument();
    expect(screen.getByText('Desconto aplicado: 240 pts (−R$ 24.00)')).toBeInTheDocument();
    expect(screen.getByText('Fotos após o serviço')).toBeInTheDocument();
  });

  it('non-COMPLETED bookings: hides after-photos even when present in the payload', () => {
    render(
      <BookingDetailMain
        booking={makeBooking({
          status: 'APPROVED',
          afterServicePhotoUrls: ['https://example.com/after.jpg'],
        })}
      />,
    );
    expect(screen.queryByText('Fotos após o serviço')).not.toBeInTheDocument();
  });

  it('shows the previous info response when present', () => {
    render(<BookingDetailMain booking={makeBooking({ infoResponseMessage: 'Seguem as fotos' })} />);
    expect(screen.getByText('Sua resposta')).toBeInTheDocument();
    expect(screen.getByText('Seguem as fotos')).toBeInTheDocument();
  });
});
