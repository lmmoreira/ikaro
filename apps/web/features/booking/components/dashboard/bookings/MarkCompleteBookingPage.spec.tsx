// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderWithIntl } from '@/test-utils';
import type { StaffBookingDetailResponse } from '@ikaro/types';
import { createAttachmentSignedUrl } from '@/features/booking/api/public';
import { getBooking } from '@/features/booking/api/staff';
import { MarkCompleteBookingPage } from './MarkCompleteBookingPage';

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

const completeBookingMutateAsync = vi.hoisted(() => vi.fn());
const setBookingStatus = vi.hoisted(() => vi.fn());
let fetchSpy: ReturnType<typeof vi.spyOn> | null = null;

vi.mock('@/features/booking/hooks/useBookingMutations', () => ({
  useCompleteBooking: () => ({ mutateAsync: completeBookingMutateAsync, isPending: false }),
}));

vi.mock('@/features/booking/api/public', () => ({
  createAttachmentSignedUrl: vi.fn(),
}));

vi.mock('@/features/booking/api/staff', () => ({
  getBooking: vi.fn(),
}));

vi.mock('@/shells/dashboard/components/topbar-status-context', () => ({
  useDashboardTopbarStatus: () => ({
    bookingStatus: null,
    setBookingStatus,
  }),
}));

function makeBooking(): StaffBookingDetailResponse {
  return {
    bookingId: 'b-1',
    status: 'APPROVED',
    scheduledAt: '2026-06-16T10:00:00.000Z',
    type: 'CUSTOMER',
    contactName: 'João Silva',
    contactEmail: 'joao@example.com',
    contactPhone: '+5531999999999',
    contactAddress: null,
    pickupAddress: null,
    customerId: 'c-1',
    loyaltyBalance: 240,
    lines: [
      {
        lineId: 'l-1',
        serviceId: 'svc-1',
        serviceName: 'Lavagem Simples',
        priceAtBooking: { amount: 60, currency: 'BRL' },
        durationMinsAtBooking: 30,
        pointsValueAtBooking: 5,
        requiresPickupAddressAtBooking: false,
      },
      {
        lineId: 'l-2',
        serviceId: 'svc-2',
        serviceName: 'Cera',
        priceAtBooking: { amount: 40, currency: 'BRL' },
        durationMinsAtBooking: 20,
        pointsValueAtBooking: 3,
        requiresPickupAddressAtBooking: false,
      },
    ],
    totalPrice: { amount: 100, currency: 'BRL' },
    totalDurationMins: 50,
    beforeServicePhotoUrls: ['https://cdn.example.com/before.jpg'],
    afterServicePhotoUrls: [],
    infoRequestMessage: null,
    infoResponseMessage: null,
    approvedAt: null,
    approvedBy: null,
    rejectionReason: null,
  };
}

beforeEach(() => {
  completeBookingMutateAsync.mockReset();
  setBookingStatus.mockReset();
  vi.mocked(createAttachmentSignedUrl).mockReset();
  vi.mocked(getBooking).mockReset();
  fetchSpy?.mockRestore();
  fetchSpy = null;
});

describe('MarkCompleteBookingPage', () => {
  it('submits the charged amounts and shows the success state', async () => {
    const user = userEvent.setup();
    completeBookingMutateAsync.mockResolvedValue(undefined);
    vi.mocked(getBooking).mockResolvedValue({
      ...makeBooking(),
      loyaltyBalance: 248,
      afterServicePhotoUrls: ['https://cdn.example.com/after.jpg'],
    });

    renderWithIntl(
      <MarkCompleteBookingPage
        booking={makeBooking()}
        tenantSlug="lavacar-beloauto"
        backHref="/dashboard/bookings"
        pointsPerCurrencyUnit={10}
      />,
    );

    expect(setBookingStatus).toHaveBeenCalledWith('APPROVED');
    await user.clear(screen.getAllByRole('spinbutton')[1]);
    await user.type(screen.getAllByRole('spinbutton')[1], '70');
    await user.click(screen.getAllByRole('button', { name: 'Confirmar conclusão' })[0]);
    expect(completeBookingMutateAsync).toHaveBeenCalledWith({
      id: 'b-1',
      body: {
        lines: [
          { lineId: 'l-1', actualPriceCharged: 70 },
          { lineId: 'l-2', actualPriceCharged: 40 },
        ],
      },
    });
    expect(await screen.findByText('Serviço concluído')).toBeInTheDocument();
    expect(
      screen
        .getAllByRole('link', { name: 'Voltar à agenda' })
        .every((link) => link.getAttribute('href') === '/dashboard/bookings'),
    ).toBe(true);
    expect(await screen.findByRole('img', { name: 'Foto antes do serviço 1' })).toHaveAttribute(
      'src',
      'https://cdn.example.com/before.jpg',
    );
    expect(setBookingStatus).toHaveBeenCalledWith('COMPLETED');
  });

  it('blocks empty charged amounts before submitting', async () => {
    const user = userEvent.setup();
    renderWithIntl(
      <MarkCompleteBookingPage
        booking={makeBooking()}
        tenantSlug="lavacar-beloauto"
        backHref="/dashboard/bookings"
        pointsPerCurrencyUnit={10}
      />,
    );

    await user.clear(screen.getAllByRole('spinbutton')[1]);
    await user.click(screen.getAllByRole('button', { name: 'Confirmar conclusão' })[0]);

    expect(
      await screen.findByText('Informe um valor válido para cada serviço.'),
    ).toBeInTheDocument();
    expect(completeBookingMutateAsync).not.toHaveBeenCalled();
  });

  it('uploads after-service photos and includes them in the completion payload', async () => {
    const user = userEvent.setup();
    completeBookingMutateAsync.mockResolvedValue(undefined);
    vi.mocked(getBooking).mockResolvedValue({
      ...makeBooking(),
      loyaltyBalance: 248,
      afterServicePhotoUrls: ['https://cdn.example.com/after.jpg'],
    });
    vi.mocked(createAttachmentSignedUrl).mockResolvedValue({
      signedUrl: 'https://storage.example.com/upload?sig=abc',
      filePath: 'tenants/tenant-1/bookings/b-1/after/photo.jpg',
      expiresAt: '2026-06-15T12:00:00.000Z',
    });
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 200 }));

    renderWithIntl(
      <MarkCompleteBookingPage
        booking={makeBooking()}
        tenantSlug="lavacar-beloauto"
        backHref="/dashboard/bookings"
        pointsPerCurrencyUnit={10}
      />,
    );

    await user.upload(
      screen.getByLabelText('Depois do serviço'),
      new File(['fake-image-content'], 'photo.jpg', { type: 'image/jpeg' }),
    );

    expect(await screen.findByText('Enviada')).toBeInTheDocument();
    expect(createAttachmentSignedUrl).toHaveBeenCalledWith(
      'lavacar-beloauto',
      'photo.jpg',
      'image/jpeg',
      'b-1',
    );

    await user.click(screen.getAllByRole('button', { name: 'Confirmar conclusão' })[0]);

    expect(completeBookingMutateAsync).toHaveBeenCalledWith({
      id: 'b-1',
      body: {
        lines: [
          { lineId: 'l-1', actualPriceCharged: 60 },
          { lineId: 'l-2', actualPriceCharged: 40 },
        ],
        afterServicePhotoUrls: ['tenants/tenant-1/bookings/b-1/after/photo.jpg'],
      },
    });
    expect(await screen.findByRole('img', { name: 'Foto depois do serviço 1' })).toHaveAttribute(
      'src',
      'https://cdn.example.com/after.jpg',
    );
    expect(await screen.findByRole('img', { name: 'Foto antes do serviço 1' })).toHaveAttribute(
      'src',
      'https://cdn.example.com/before.jpg',
    );
  });

  it('keeps the desktop action panel hidden on small screens', async () => {
    const { container } = renderWithIntl(
      <MarkCompleteBookingPage
        booking={makeBooking()}
        tenantSlug="lavacar-beloauto"
        backHref="/dashboard/bookings/b-1"
        pointsPerCurrencyUnit={10}
      />,
    );

    const actionsLabels = screen.getAllByText('Ações');
    expect(actionsLabels).toHaveLength(2);
    expect(actionsLabels[0].closest('aside')).toHaveClass('hidden');

    const mobileFooter = container.querySelector('.fixed.inset-x-0.bottom-0');
    expect(mobileFooter).toHaveTextContent('Ações');
    expect(mobileFooter?.querySelector('.rounded-lg.border')).not.toBeNull();
  });

  it('shows the loyalty panel before pricing and sends discountByPoints when using all points', async () => {
    const user = userEvent.setup();
    completeBookingMutateAsync.mockResolvedValue(undefined);
    vi.mocked(getBooking).mockResolvedValue({
      ...makeBooking(),
      loyaltyBalance: 248,
      afterServicePhotoUrls: ['https://cdn.example.com/after.jpg'],
    });

    renderWithIntl(
      <MarkCompleteBookingPage
        booking={makeBooking()}
        tenantSlug="lavacar-beloauto"
        backHref="/dashboard/bookings"
        pointsPerCurrencyUnit={10}
      />,
    );

    const loyaltySection = screen.getByText('Fidelidade do cliente').closest('section');
    const pricingSection = screen.getByText('Valores cobrados').closest('section');

    expect(loyaltySection).not.toBeNull();
    expect(pricingSection).not.toBeNull();
    const loyaltyBeforePricing =
      (loyaltySection!.compareDocumentPosition(pricingSection!) &
        Node.DOCUMENT_POSITION_FOLLOWING) !==
      0;
    expect(loyaltyBeforePricing).toBe(true);

    expect(screen.getByText('Saldo atual: 240 pontos disponíveis')).toBeInTheDocument();
    expect(screen.getByText('10 pts = R$ 1,00 · Valor máximo: R$ 24,00')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Usar todos' }));
    expect(screen.getByRole('spinbutton', { name: 'Pontos a usar' })).toHaveValue(240);
    expect(screen.getAllByText('Desconto fidelidade: -R$ 24,00')).toHaveLength(2);
    expect(screen.getByText('Total cobrado: R$ 76,00')).toBeInTheDocument();
    expect(screen.getByText('Cliente ganhará 8 pontos')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Foto antes do serviço 1' })).toHaveAttribute(
      'src',
      'https://cdn.example.com/before.jpg',
    );

    await user.click(screen.getAllByRole('button', { name: 'Confirmar conclusão' })[0]);

    expect(completeBookingMutateAsync).toHaveBeenCalledWith({
      id: 'b-1',
      body: {
        lines: [
          { lineId: 'l-1', actualPriceCharged: 60 },
          { lineId: 'l-2', actualPriceCharged: 40 },
        ],
        discountByPoints: {
          pointsUsed: 240,
          amountDeducted: 24,
        },
      },
    });
    expect(await screen.findByText('★ 8 pontos ativos')).toBeInTheDocument();
  });
});
