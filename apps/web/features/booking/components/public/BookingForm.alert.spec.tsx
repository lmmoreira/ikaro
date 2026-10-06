// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DaySummary, HotsiteAddressSpec } from '@ikaro/types';
import {
  fetchPublicIntakeSchema,
  fetchServiceResourceOptions,
} from '@/features/booking/api/public';
import { getHotsiteCustomerProfile } from '@/features/platform/hotsite/api/customers';
import {
  fetchAvailability,
  fetchAvailabilitySummary,
} from '@/features/platform/hotsite/api/schedule';
import { hotsiteServiceBookingDefaults, makeHotsiteService, renderWithIntl } from '@/test-utils';
import { BookingForm } from './BookingForm';

// M23-S31 — the calendar step offers "Avise-me quando abrir" only for a basket of exactly one
// alert-eligible service, linking to the alert page with that service in the query.

const ADDRESS_SPEC: HotsiteAddressSpec = {
  postalLabel: 'CEP',
  postalPlaceholder: '00000-000',
  stateLabel: 'UF',
  requireNeighborhood: true,
  neighborhoodLabel: 'Bairro',
  streetLabel: 'Rua',
  numberLabel: 'Número',
  complementLabel: 'Complemento',
  cityLabel: 'Cidade',
  lookupService: 'viacep',
};

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));

vi.mock('@/features/booking/api/public', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/booking/api/public')>();
  return { ...actual, fetchPublicIntakeSchema: vi.fn(), fetchServiceResourceOptions: vi.fn() };
});

vi.mock('@/features/platform/hotsite/api/customers', () => ({
  getHotsiteCustomerProfile: vi.fn(),
}));

vi.mock('@/features/platform/hotsite/api/schedule', () => ({
  fetchAvailabilitySummary: vi.fn(),
  fetchAvailability: vi.fn(),
}));

const eligible = {
  ...hotsiteServiceBookingDefaults.bookingPolicy,
  availabilityAlertEligible: true,
};
const day: DaySummary = { date: '2026-06-15', available: true, slotCount: 1 };

async function openCalendarStep(
  services: ReturnType<typeof makeHotsiteService>[],
  selectCount = 1,
) {
  const user = userEvent.setup();
  renderWithIntl(
    <BookingForm
      slug="acme"
      services={services}
      carouselDays={14}
      datePickerType="carousel"
      maxBookingAdvanceDays={90}
      phonePrefix="+55"
      addressSpec={ADDRESS_SPEC}
    />,
  );
  const boxes = screen.getAllByRole('checkbox');
  for (const box of boxes.slice(0, selectCount)) await user.click(box);
  await user.click(screen.getByRole('button', { name: 'Próximo' }));
  await screen.findAllByTestId('day-option');
}

describe('BookingForm — alert entry on the calendar step', () => {
  beforeEach(() => {
    vi.mocked(getHotsiteCustomerProfile).mockResolvedValue(null);
    vi.mocked(fetchPublicIntakeSchema).mockResolvedValue({ active: null });
    vi.mocked(fetchServiceResourceOptions).mockResolvedValue({ requirements: [] });
    vi.mocked(fetchAvailabilitySummary).mockResolvedValue([day]);
    vi.mocked(fetchAvailability).mockResolvedValue({ date: day.date, available: true, slots: [] });
  });

  afterEach(() => {
    vi.mocked(fetchAvailabilitySummary).mockReset();
    vi.mocked(fetchAvailability).mockReset();
    vi.mocked(getHotsiteCustomerProfile).mockReset();
  });

  it('links to the alert page with the service when exactly one eligible service is selected', async () => {
    await openCalendarStep([makeHotsiteService({ id: 'svc-1', bookingPolicy: eligible })]);

    expect(screen.getByTestId('availability-alert-entry')).toHaveAttribute(
      'href',
      '/acme/booking/availability-alert?serviceId=svc-1',
    );
  });

  it('offers no alert for a service that does not permit alerts', async () => {
    await openCalendarStep([makeHotsiteService({ id: 'svc-1' })]);

    expect(screen.queryByTestId('availability-alert-entry')).not.toBeInTheDocument();
  });

  it('offers no alert for a basket of several services — an alert is for exactly one', async () => {
    await openCalendarStep(
      [
        makeHotsiteService({ id: 'svc-1', name: 'Lavagem', bookingPolicy: eligible }),
        makeHotsiteService({ id: 'svc-2', name: 'Cera', bookingPolicy: eligible }),
      ],
      2,
    );

    expect(screen.queryByTestId('availability-alert-entry')).not.toBeInTheDocument();
  });

  it('is still there when the availability has no slots (a fully booked calendar)', async () => {
    vi.mocked(fetchAvailabilitySummary).mockResolvedValue([{ ...day, available: false }]);
    await openCalendarStep([makeHotsiteService({ id: 'svc-1', bookingPolicy: eligible })]);

    expect(screen.getByTestId('availability-alert-entry')).toBeInTheDocument();
  });
});
