// @vitest-environment jsdom
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { StaffBookingDetailResponse } from '@ikaro/types';
import { renderWithIntl } from '@/test-utils';
import { BookingDetailAsideCard } from './BookingDetailAsideCard';

const desktop = () => within(screen.getByTestId('action-pane-desktop'));

vi.mock('./BookingDecisionPanel', () => ({
  BookingDecisionPanel: () => <div data-testid="booking-decision-panel" />,
}));

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));

function makeBooking(overrides?: Partial<StaffBookingDetailResponse>): StaffBookingDetailResponse {
  return {
    notes: null,
    adminNotes: null,
    createdAt: '2026-06-14T09:12:00.000Z',
    createdByName: null,
    resources: [],
    itinerary: [],
    participantCount: null,
    attendees: [],
    intake: null,
    recurringScheduleId: null,
    cancellation: null,
    rejection: null,
    bookingId: 'b-1',
    status: 'PENDING',
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
        priceAtBooking: { amount: 100, currency: 'BRL' },
        durationMinsAtBooking: 30,
        pointsValueAtBooking: 5,
        requiresPickupAddressAtBooking: false,
        actualPriceCharged: null,
      },
    ],
    totalPrice: { amount: 100, currency: 'BRL' },
    totalActualPrice: null,
    discountPointsUsed: null,
    discountAmount: null,
    totalDurationMins: 30,
    beforeServicePhotoUrls: [],
    afterServicePhotoUrls: [],
    beforeServicePhotoPaths: [],
    afterServicePhotoPaths: [],
    infoRequestMessage: null,
    infoResponseMessage: null,
    approvedAt: null,
    approvedBy: null,
    completedAt: null,
    rejectionReason: null,
    statusHistory: [],
    hasOpenException: false,
    ...overrides,
  };
}

function baseProps(overrides: Partial<Parameters<typeof BookingDetailAsideCard>[0]> = {}) {
  return {
    actionState: 'idle' as const,
    booking: makeBooking(),
    backHref: '/dashboard/bookings',
    feedback: null,
    noShowAvailableAt: null,
    canCorrectNoShow: false,
    canDecide: false,
    onBookingRefreshed: vi.fn(),
    onOpenNoShow: vi.fn(),
    onOpenCorrectNoShow: vi.fn(),
    onBackWithoutApprove: vi.fn(),
    onOpenComplete: vi.fn(),
    onOpenReschedule: vi.fn(),
    onOpenCancel: vi.fn(),
    onApprove: vi.fn(),
    onOpenReject: vi.fn(),
    onOpenRequestInfo: vi.fn(),
    ...overrides,
  };
}

describe('BookingDetailAsideCard', () => {
  it.each(['CANCELLED', 'REJECTED', 'COMPLETED'] as const)(
    'gives a %s booking the way back to the Agenda and no action buttons',
    (status) => {
      renderWithIntl(
        <BookingDetailAsideCard {...baseProps({ booking: makeBooking({ status }) })} />,
      );

      expect(desktop().getByRole('link', { name: 'Voltar à agenda' })).toHaveAttribute(
        'href',
        '/dashboard/bookings',
      );
      expect(desktop().queryByRole('button')).not.toBeInTheDocument();
    },
  );

  it('renders the back-to-agenda card when actionState is approved', () => {
    renderWithIntl(<BookingDetailAsideCard {...baseProps({ actionState: 'approved' })} />);

    expect(desktop().getByRole('link', { name: 'Voltar à agenda' })).toHaveAttribute(
      'href',
      '/dashboard/bookings',
    );
  });

  it('calls onBackWithoutApprove when the slot-conflict back button is clicked', async () => {
    const user = userEvent.setup();
    const onBackWithoutApprove = vi.fn();
    renderWithIntl(
      <BookingDetailAsideCard
        {...baseProps({ actionState: 'slot-conflict', onBackWithoutApprove })}
      />,
    );

    await user.click(desktop().getByRole('button', { name: /Voltar/ }));

    expect(onBackWithoutApprove).toHaveBeenCalledTimes(1);
  });

  it('calls onApprove when the approve button is clicked for a triage (idle) booking', async () => {
    const user = userEvent.setup();
    const onApprove = vi.fn();
    renderWithIntl(<BookingDetailAsideCard {...baseProps({ onApprove })} />);

    await user.click(desktop().getByRole('button', { name: 'Aprovar' }));

    expect(onApprove).toHaveBeenCalledTimes(1);
  });

  it('calls onOpenComplete/onOpenReschedule/onOpenCancel for an approved booking', async () => {
    const user = userEvent.setup();
    const onOpenComplete = vi.fn();
    renderWithIntl(
      <BookingDetailAsideCard
        {...baseProps({ booking: makeBooking({ status: 'APPROVED' }), onOpenComplete })}
      />,
    );

    await user.click(desktop().getByRole('button', { name: 'Marcar concluído' }));

    expect(onOpenComplete).toHaveBeenCalledTimes(1);
  });

  describe('no-show (UC-074)', () => {
    it('opens the no-show sheet from the approved booking panel', async () => {
      const user = userEvent.setup();
      const onOpenNoShow = vi.fn();
      renderWithIntl(
        <BookingDetailAsideCard
          {...baseProps({ booking: makeBooking({ status: 'APPROVED' }), onOpenNoShow })}
        />,
      );

      await user.click(desktop().getByRole('button', { name: 'Marcar não compareceu' }));

      expect(onOpenNoShow).toHaveBeenCalledTimes(1);
    });

    it('passes the end time down so the approved panel disables the action', () => {
      renderWithIntl(
        <BookingDetailAsideCard
          {...baseProps({
            booking: makeBooking({ status: 'APPROVED' }),
            noShowAvailableAt: '17:30',
          })}
        />,
      );

      expect(desktop().getByRole('button', { name: 'Marcar não compareceu' })).toBeDisabled();
      expect(
        desktop().getByText('Disponível após o término do atendimento (17:30).'),
      ).toBeVisible();
    });

    it('offers the correction on a NO_SHOW booking to a manager, never the triage actions', async () => {
      const user = userEvent.setup();
      const onOpenCorrectNoShow = vi.fn();
      renderWithIntl(
        <BookingDetailAsideCard
          {...baseProps({
            booking: makeBooking({ status: 'NO_SHOW' }),
            canCorrectNoShow: true,
            onOpenCorrectNoShow,
          })}
        />,
      );

      await user.click(desktop().getByRole('button', { name: 'Corrigir para concluído' }));

      expect(onOpenCorrectNoShow).toHaveBeenCalledTimes(1);
      expect(desktop().queryByRole('button', { name: 'Aprovar' })).not.toBeInTheDocument();
    });

    it('hides the correction from staff on a NO_SHOW booking', () => {
      renderWithIntl(
        <BookingDetailAsideCard
          {...baseProps({ booking: makeBooking({ status: 'NO_SHOW' }), canCorrectNoShow: false })}
        />,
      );

      expect(desktop().queryByRole('button')).not.toBeInTheDocument();
      expect(screen.getByTestId('no-show-read-only-note')).toBeInTheDocument();
    });

    it('right after marking, shows back-to-agenda with the manager-correction note, not the correction', () => {
      renderWithIntl(
        <BookingDetailAsideCard
          {...baseProps({
            actionState: 'no-show',
            booking: makeBooking({ status: 'NO_SHOW' }),
            canCorrectNoShow: true,
          })}
        />,
      );

      expect(desktop().getByRole('link', { name: 'Voltar à agenda' })).toBeInTheDocument();
      expect(
        desktop().getByText('Se foi um engano, um gerente pode corrigir o registro.'),
      ).toBeInTheDocument();
      expect(
        desktop().queryByRole('button', { name: 'Corrigir para concluído' }),
      ).not.toBeInTheDocument();
    });

    it('right after correcting, shows back-to-agenda', () => {
      renderWithIntl(
        <BookingDetailAsideCard
          {...baseProps({
            actionState: 'corrected',
            booking: makeBooking({ status: 'COMPLETED' }),
          })}
        />,
      );

      expect(desktop().getByRole('link', { name: 'Voltar à agenda' })).toBeInTheDocument();
    });

    it.each(['no-show-not-ended', 'no-show-error', 'no-show-terminal'] as const)(
      'keeps the approved panel under the %s banner so the action can be retried',
      (actionState) => {
        renderWithIntl(
          <BookingDetailAsideCard
            {...baseProps({ actionState, booking: makeBooking({ status: 'APPROVED' }) })}
          />,
        );

        expect(desktop().getByRole('button', { name: 'Marcar não compareceu' })).toBeEnabled();
      },
    );

    it.each(['correct-error', 'correct-forbidden'] as const)(
      'keeps the correction available under the %s banner',
      (actionState) => {
        renderWithIntl(
          <BookingDetailAsideCard
            {...baseProps({
              actionState,
              booking: makeBooking({ status: 'NO_SHOW' }),
              canCorrectNoShow: true,
            })}
          />,
        );

        expect(desktop().getByRole('button', { name: 'Corrigir para concluído' })).toBeEnabled();
      },
    );
  });

  // M23-S46 — a booking with an open "Reservas a resolver" entry.
  describe('while the booking needs a decision', () => {
    const marked = (status: StaffBookingDetailResponse['status']) =>
      makeBooking({ status, hasOpenException: true });

    it.each(['PENDING', 'INFO_REQUESTED', 'APPROVED'] as const)(
      'gives a manager the decision panel and none of the normal actions on a %s booking',
      (status) => {
        renderWithIntl(
          <BookingDetailAsideCard {...baseProps({ booking: marked(status), canDecide: true })} />,
        );

        expect(screen.getByTestId('booking-decision-panel')).toBeInTheDocument();
        for (const name of [
          'Aprovar',
          'Rejeitar',
          'Marcar concluído',
          'Marcar não compareceu',
          'Reagendar',
          'Cancelar agendamento',
        ]) {
          expect(screen.queryByRole('button', { name })).not.toBeInTheDocument();
        }
      },
    );

    // Negative guarantee: STAFF gets neither the panel nor any action (the banner explains why).
    it.each(['PENDING', 'APPROVED'] as const)(
      'renders nothing at all for STAFF on a %s booking',
      (status) => {
        const { container } = renderWithIntl(
          <BookingDetailAsideCard {...baseProps({ booking: marked(status), canDecide: false })} />,
        );

        expect(container).toBeEmptyDOMElement();
      },
    );

    it('does not hide the transient outcome panels (approved, slot-conflict)', () => {
      renderWithIntl(
        <BookingDetailAsideCard
          {...baseProps({
            actionState: 'approved',
            booking: marked('APPROVED'),
            canDecide: true,
          })}
        />,
      );

      expect(desktop().getByRole('link', { name: 'Voltar à agenda' })).toBeInTheDocument();
      expect(screen.queryByTestId('booking-decision-panel')).not.toBeInTheDocument();
    });

    it('shows the way back to the agenda on a booking that was just cancelled, even if an entry is still listed', () => {
      renderWithIntl(
        <BookingDetailAsideCard
          {...baseProps({
            actionState: 'cancelled',
            booking: marked('CANCELLED'),
            canDecide: true,
          })}
        />,
      );

      expect(desktop().getByRole('link', { name: 'Voltar à agenda' })).toBeInTheDocument();
      expect(screen.queryByTestId('booking-decision-panel')).not.toBeInTheDocument();
    });

    it('shows every normal action again for a booking without an open entry', () => {
      renderWithIntl(
        <BookingDetailAsideCard
          {...baseProps({
            booking: makeBooking({ status: 'APPROVED', hasOpenException: false }),
            canDecide: true,
          })}
        />,
      );

      expect(screen.queryByTestId('booking-decision-panel')).not.toBeInTheDocument();
      expect(desktop().getByRole('button', { name: 'Marcar concluído' })).toBeInTheDocument();
    });
  });
  describe('feedback in the action pane (TD57-S12)', () => {
    it('renders a failure under the buttons of the desktop pane and above the buttons of the mobile bar', () => {
      renderWithIntl(
        <BookingDetailAsideCard
          {...baseProps({
            feedback: { variant: 'error', title: 'Erro ao aprovar. Tente novamente.' },
          })}
        />,
      );

      const desktopPane = screen.getByTestId('action-pane-desktop');
      const feedback = within(desktopPane).getByTestId('form-feedback');
      expect(feedback).toHaveAttribute('role', 'alert');
      expect(feedback).toHaveTextContent('Erro ao aprovar. Tente novamente.');
      const approve = within(desktopPane).getByRole('button', { name: 'Aprovar' });
      expect(
        approve.compareDocumentPosition(feedback) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();

      const mobileBar = screen.getByTestId('action-pane-mobile');
      expect(within(mobileBar).getByTestId('form-feedback-mobile')).toHaveTextContent(
        'Erro ao aprovar. Tente novamente.',
      );
    });

    it('renders no feedback card when there is no message', () => {
      renderWithIntl(<BookingDetailAsideCard {...baseProps()} />);

      expect(screen.queryByTestId('form-feedback')).not.toBeInTheDocument();
      expect(screen.queryByTestId('form-feedback-mobile')).not.toBeInTheDocument();
    });

    it('uses the shared ActionPane, with a fixed mobile bar at bottom-0 and no bar of its own', () => {
      renderWithIntl(
        <BookingDetailAsideCard {...baseProps({ booking: makeBooking({ status: 'APPROVED' }) })} />,
      );

      const mobileBar = screen.getByTestId('action-pane-mobile');
      expect(mobileBar).toHaveClass('fixed', 'bottom-0');
      expect(screen.getByTestId('action-pane-desktop')).toHaveClass('lg:sticky');
    });

    it('keeps the lifecycle buttons while a no-show failure is shown, with its retry', async () => {
      const user = userEvent.setup();
      const onRetry = vi.fn();
      renderWithIntl(
        <BookingDetailAsideCard
          {...baseProps({
            actionState: 'no-show-error',
            booking: makeBooking({ status: 'APPROVED' }),
            feedback: {
              variant: 'error',
              title: 'Não foi possível registrar o não comparecimento',
              hint: 'Verifique sua conexão e tente novamente. Nada foi alterado.',
              onRetry,
              retryLabel: 'Tentar novamente',
              testId: 'booking-no-show-error',
            },
          })}
        />,
      );

      expect(desktop().getByRole('button', { name: 'Marcar concluído' })).toBeInTheDocument();
      await user.click(
        within(screen.getByTestId('booking-no-show-error')).getByRole('button', {
          name: 'Tentar novamente',
        }),
      );

      expect(onRetry).toHaveBeenCalledTimes(1);
    });
  });
});
