// @vitest-environment jsdom
import { useEffect } from 'react';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BookingErrorCode,
  type AvailableSlot,
  type BookingRescheduleOptions,
  type CustomerBookingDetailResponse,
} from '@ikaro/types';
import { ApiError } from '@/shared/lib/api/errors';
import { renderWithIntl } from '@/test-utils';
import {
  CustomerTopbarStatusProvider,
  useCustomerTopbarStatus,
} from '../customer-topbar-status-context';
import { CustomerReschedulePage } from './CustomerReschedulePage';

const rescheduleMock = vi.fn();
vi.mock('@/features/booking/api/customer', () => ({
  rescheduleBookingAsCustomer: (...args: unknown[]) => rescheduleMock(...args),
}));

const pickerMounts = vi.fn();
vi.mock('./ReschedulePicker', () => ({
  ReschedulePicker: ({
    onSelectSlot,
    selectedDate,
  }: {
    onSelectSlot: (slot: AvailableSlot) => void;
    selectedDate: string | null;
  }) => {
    useEffect(() => {
      pickerMounts();
    }, []);
    return (
      <div data-testid="picker" data-date={selectedDate ?? ''}>
        <button
          type="button"
          onClick={() =>
            onSelectSlot({
              startsAt: '2030-06-23T13:00:00.000Z',
              endsAt: '2030-06-23T14:00:00.000Z',
            })
          }
        >
          pick-slot
        </button>
      </div>
    );
  },
}));

const NEW_START = '2030-06-23T13:00:00.000Z';
const DAY_MS = 24 * 60 * 60 * 1000;
const daysFromNow = (days: number): string => new Date(Date.now() + days * DAY_MS).toISOString();
const tenantDay = (iso: string): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date(iso));

function topbarProbe(): React.JSX.Element {
  function Probe(): React.JSX.Element {
    const status = useCustomerTopbarStatus();
    return (
      <p data-testid="probe">
        {status?.bookingStatus ?? 'none'}|{status?.backHrefOverride ?? 'none'}
      </p>
    );
  }
  return <Probe />;
}

function makeReschedule(
  overrides: Partial<BookingRescheduleOptions> = {},
): BookingRescheduleOptions {
  return {
    eligibleUntil: new Date(Date.now() + 48 * 3_600_000).toISOString(),
    serviceIds: ['svc-1'],
    resourceSelections: [],
    durationMinutes: null,
    window: { minAdvanceHours: 0, maxAdvanceDays: 90 },
    keptPicks: [],
    ...overrides,
  };
}

const SCHEDULED_AT = daysFromNow(5);

function makeBooking(
  reschedule: BookingRescheduleOptions,
  overrides: Partial<CustomerBookingDetailResponse> = {},
): CustomerBookingDetailResponse {
  return {
    bookingId: 'b1',
    status: 'APPROVED',
    scheduledAt: SCHEDULED_AT,
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
    reschedule,
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

function renderPage(
  reschedule = makeReschedule(),
  returnTo: string | null = null,
  scheduledAt = SCHEDULED_AT,
) {
  return renderWithIntl(
    <CustomerTopbarStatusProvider>
      {topbarProbe()}
      <CustomerReschedulePage
        booking={makeBooking(reschedule, { scheduledAt })}
        reschedule={reschedule}
        scheduledAt={scheduledAt}
        tenantSlug="lavacar-bh"
        whatsapp="+55 11 99999-0000"
        returnTo={returnTo}
      />
    </CustomerTopbarStatusProvider>,
  );
}

async function pickSlotAndConfirm(): Promise<void> {
  await userEvent.click(screen.getByRole('button', { name: 'pick-slot' }));
  const confirms = screen.getAllByRole('button', { name: 'Confirmar novo horário' });
  await userEvent.click(confirms[0]!);
}

function rejectWith(code: string | undefined, status = 409): void {
  rescheduleMock.mockRejectedValueOnce(new ApiError(status, 'failure', code ? { code } : {}));
}

describe('CustomerReschedulePage', () => {
  beforeEach(() => {
    rescheduleMock.mockReset();
    pickerMounts.mockClear();
  });

  it('shows the current booking and keeps confirming disabled until a slot is chosen', () => {
    renderPage();

    expect(screen.getByRole('heading', { name: 'Reagendar agendamento' })).toBeInTheDocument();
    expect(screen.getByText('Lavagem Completa')).toBeInTheDocument();
    expect(screen.getByTestId('picker')).toHaveAttribute('data-date', tenantDay(SCHEDULED_AT));
    for (const button of screen.getAllByRole('button', { name: 'Confirmar novo horário' })) {
      expect(button).toBeDisabled();
    }
  });

  it('preselects no day when the booking is beyond the date strip, so no slot list opens', () => {
    renderPage(makeReschedule(), null, daysFromNow(30));

    expect(screen.getByTestId('picker')).toHaveAttribute('data-date', '');
  });

  it('preselects no day when the booking is beyond the effective maximum advance', () => {
    renderPage(
      makeReschedule({ window: { minAdvanceHours: 0, maxAdvanceDays: 3 } }),
      null,
      daysFromNow(5),
    );

    expect(screen.getByTestId('picker')).toHaveAttribute('data-date', '');
  });

  it('lists the kept picks read-only when the booking has any', () => {
    renderPage(
      makeReschedule({
        keptPicks: [
          {
            serviceName: 'Massagem',
            legName: null,
            legIndex: null,
            resourceType: 'STAFF',
            resourceName: 'Renata Souza',
          },
        ],
      }),
    );

    expect(screen.getByTestId('reschedule-kept-picks')).toHaveTextContent('Renata Souza');
  });

  it('syncs the booking status and the back link to the shared topbar', () => {
    renderPage(makeReschedule(), '/lavacar-bh/my-account/loyalty');

    expect(screen.getByTestId('probe')).toHaveTextContent(
      'APPROVED|/lavacar-bh/my-account/bookings/b1?returnTo=%2Flavacar-bh%2Fmy-account%2Floyalty',
    );
  });

  it('shows the De/Para summary once a slot is chosen, then reschedules with scheduledAt only', async () => {
    rescheduleMock.mockResolvedValueOnce(undefined);
    renderPage();

    await pickSlotAndConfirm();

    expect(rescheduleMock).toHaveBeenCalledWith('b1', NEW_START);
    expect(await screen.findByTestId('reschedule-success')).toHaveTextContent(
      'Agendamento reagendado!',
    );
  });

  it('shows the summary of what will change after picking a slot', async () => {
    renderPage();

    await userEvent.click(screen.getByRole('button', { name: 'pick-slot' }));

    expect(screen.getAllByTestId('reschedule-change-summary')[0]).toHaveTextContent(/De: /);
    expect(screen.getAllByTestId('reschedule-change-summary')[0]).toHaveTextContent(/Para: /);
  });

  it('a lost race shows the catalogue message, clears the slot and reloads the list', async () => {
    rejectWith(BookingErrorCode.SLOT_UNAVAILABLE);
    renderPage();
    const mountsBefore = pickerMounts.mock.calls.length;

    await pickSlotAndConfirm();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('O horário solicitado não está mais disponível.');
    expect(alert).toHaveTextContent('Seu agendamento continua no horário original.');
    expect(screen.getAllByRole('button', { name: 'Confirmar novo horário' })[0]).toBeDisabled();
    await waitFor(() => expect(pickerMounts.mock.calls.length).toBeGreaterThan(mountsBefore));
  });

  it.each([BookingErrorCode.BUNDLE_PARTIALLY_UNAVAILABLE, BookingErrorCode.LEG_UNAVAILABLE])(
    '%s says nothing was changed and reloads the list',
    async (code) => {
      rejectWith(code);
      renderPage();
      const mountsBefore = pickerMounts.mock.calls.length;

      await pickSlotAndConfirm();

      expect(await screen.findByRole('alert')).toHaveTextContent('Nada foi alterado');
      await waitFor(() => expect(pickerMounts.mock.calls.length).toBeGreaterThan(mountsBefore));
    },
  );

  it.each([
    [BookingErrorCode.TOO_SOON, 'Esse horário exige mais antecedência.'],
    [BookingErrorCode.TOO_FAR_AHEAD, 'Esse horário está além do prazo máximo de agendamento.'],
    [BookingErrorCode.SCHEDULED_IN_PAST, 'O novo horário deve ser no futuro.'],
  ])('%s shows its catalogue message and reloads the list', async (code, message) => {
    rejectWith(code, 422);
    renderPage();
    const mountsBefore = pickerMounts.mock.calls.length;

    await pickSlotAndConfirm();

    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    expect(screen.getAllByRole('button', { name: 'Confirmar novo horário' })[0]).toBeDisabled();
    await waitFor(() => expect(pickerMounts.mock.calls.length).toBeGreaterThan(mountsBefore));
  });

  it('an expired window answered by the server shows the deadline screen', async () => {
    rejectWith(BookingErrorCode.RESCHEDULE_WINDOW_EXPIRED, 422);
    renderPage();

    await pickSlotAndConfirm();

    expect(await screen.findByTestId('reschedule-window-error')).toHaveTextContent(
      'Reagendamento fora do prazo',
    );
    expect(screen.queryByTestId('picker')).not.toBeInTheDocument();
  });

  it('a generic failure keeps the chosen slot so confirming again retries', async () => {
    rejectWith(undefined, 500);
    renderPage();
    const mountsBefore = pickerMounts.mock.calls.length;

    await pickSlotAndConfirm();

    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível reagendar.');
    expect(screen.getAllByRole('button', { name: 'Confirmar novo horário' })[0]).toBeEnabled();
    expect(pickerMounts.mock.calls).toHaveLength(mountsBefore);
  });

  it('opened past the deadline it shows the deadline screen without the slot picker', () => {
    renderPage(makeReschedule({ eligibleUntil: new Date(Date.now() - 3_600_000).toISOString() }));

    expect(screen.getByTestId('reschedule-window-error')).toBeInTheDocument();
    expect(screen.queryByTestId('picker')).not.toBeInTheDocument();
  });
});
