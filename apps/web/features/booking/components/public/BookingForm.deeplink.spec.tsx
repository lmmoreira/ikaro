// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  AvailabilityResponse,
  DaySummary,
  HotsiteAddressSpec,
  HotsiteServiceResourceOptionsRequirement,
  HotsiteServiceResponse,
} from '@ikaro/types';
import { choiceRequirement, makeHotsiteService, renderWithIntl } from '@/test-utils';
import {
  fetchPublicIntakeSchema,
  fetchServiceQuote,
  fetchServiceResourceOptions,
} from '@/features/booking/api/public';
import { getHotsiteCustomerProfile } from '@/features/platform/hotsite/api/customers';
import {
  fetchAvailability,
  fetchAvailabilitySummary,
} from '@/features/platform/hotsite/api/schedule';
import type { BookingDeepLinkSeed } from '@/features/booking/model/booking-deep-link';
import { BookingForm } from './BookingForm';

// The fixtures use fixed 2026-06-15 slots; the picker hides a slot that has already started, so the
// clock is pinned to the morning of that day.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-06-15T08:00:00.000Z'));
});

afterEach(() => {
  vi.useRealTimers();
});

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));

vi.mock('@/features/booking/api/public', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/booking/api/public')>();
  return {
    ...actual,
    createBooking: vi.fn(),
    createAuthenticatedBooking: vi.fn(),
    createAttachmentSignedUrl: vi.fn(),
    fetchPublicIntakeSchema: vi.fn(),
    fetchServiceResourceOptions: vi.fn(),
    fetchServiceQuote: vi.fn(),
  };
});

vi.mock('@/features/platform/hotsite/api/customers', () => ({
  getHotsiteCustomerProfile: vi.fn(),
}));

vi.mock('@/features/platform/hotsite/api/schedule', () => ({
  fetchAvailabilitySummary: vi.fn(),
  fetchAvailability: vi.fn(),
}));

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

const day: DaySummary = { date: '2026-06-15', available: true, slotCount: 1 };
const slot = { startsAt: '2026-06-15T12:00:00.000Z', endsAt: '2026-06-15T13:00:00.000Z' };
const availability: AvailabilityResponse = { date: '2026-06-15', available: true, slots: [slot] };

const PLAIN = 'svc-plain';
const STAFF = 'svc-staff';
const VARIABLE = 'svc-variable';

const plainService = makeHotsiteService({ id: PLAIN, name: 'Corte' });
const staffService = makeHotsiteService({
  id: STAFF,
  name: 'Corte + Escova',
  resourceRequirements: [choiceRequirement('STAFF')],
});
const variableService = makeHotsiteService({
  id: VARIABLE,
  name: 'Alongamento',
  durationMinutes: 60,
  bookingPolicy: {
    ...makeHotsiteService().bookingPolicy,
    durationPolicy: 'CUSTOMER_SELECTED',
    durationMinMinutes: 60,
    durationMaxMinutes: 120,
    durationIncrementMinutes: 30,
    pricingPolicy: 'PER_TIME_INCREMENT',
    pricingIncrementMinutes: 60,
    pricePerIncrementAmount: 50,
  },
});

function staffOptions(): HotsiteServiceResourceOptionsRequirement {
  return {
    serviceId: STAFF,
    legIndex: null,
    resourceType: 'STAFF',
    selectionMode: 'CUSTOMER_CHOICE',
    requiredQuantity: 1,
    options: [
      { resourceId: 'staff-0', name: 'Ana' },
      { resourceId: 'staff-1', name: 'Bia' },
    ],
  };
}

function seedOf(serviceId: string, rest: Partial<BookingDeepLinkSeed> = {}): BookingDeepLinkSeed {
  return { serviceId, date: null, durationMinutes: null, resourceId: null, ...rest };
}

function renderForm(services: HotsiteServiceResponse[], seed?: BookingDeepLinkSeed | null) {
  return renderWithIntl(
    <BookingForm
      slug="lavacar-beloauto"
      services={services}
      carouselDays={14}
      datePickerType="carousel"
      maxBookingAdvanceDays={90}
      timezone="UTC"
      phonePrefix="+55"
      addressSpec={ADDRESS_SPEC}
      seed={seed}
    />,
  );
}

const next = () => screen.getByTestId('step-next');

beforeEach(() => {
  vi.mocked(getHotsiteCustomerProfile).mockResolvedValue(null);
  vi.mocked(fetchPublicIntakeSchema).mockResolvedValue({ active: null });
  vi.mocked(fetchServiceResourceOptions).mockImplementation(async (_slug, serviceId) => ({
    requirements: serviceId === STAFF ? [staffOptions()] : [],
  }));
  vi.mocked(fetchServiceQuote).mockImplementation(async (_slug, _id, minutes) => ({
    durationMinutes: minutes,
    price: { amount: (minutes / 60) * 50, currency: 'BRL' },
  }));
  vi.mocked(fetchAvailabilitySummary).mockResolvedValue([day]);
  vi.mocked(fetchAvailability).mockResolvedValue(availability);
});

afterEach(() => {
  [
    fetchPublicIntakeSchema,
    fetchServiceResourceOptions,
    fetchServiceQuote,
    fetchAvailabilitySummary,
    fetchAvailability,
    getHotsiteCustomerProfile,
  ].forEach((fn) => vi.mocked(fn).mockReset());
});

describe('BookingForm — availability-alert deep link', () => {
  it('opens on Step 1 with only the link’s service ticked and does not advance', () => {
    renderForm([plainService, staffService], seedOf(PLAIN));

    const [plain, staff] = screen.getAllByRole('checkbox');
    expect(plain).toBeChecked();
    expect(staff).not.toBeChecked();
    expect(screen.getByText('Passo 1 de 4')).toBeInTheDocument();
  });

  it('starts with nothing ticked when there is no link (the plain booking page)', () => {
    renderForm([plainService, staffService]);

    for (const box of screen.getAllByRole('checkbox')) expect(box).not.toBeChecked();
  });

  it('shows the link’s day already selected on the availability step', async () => {
    const user = userEvent.setup();
    renderForm([plainService], seedOf(PLAIN, { date: '2026-06-15' }));

    await user.click(next());

    expect(await screen.findByText('09:00–10:00')).toBeInTheDocument();
    expect(fetchAvailability).toHaveBeenCalledWith(
      'lavacar-beloauto',
      '2026-06-15',
      [PLAIN],
      expect.anything(),
    );
  });

  it('shows the existing no-slots message when the link’s day has filled up', async () => {
    const user = userEvent.setup();
    vi.mocked(fetchAvailability).mockResolvedValue({
      ...availability,
      available: false,
      slots: [],
    });
    renderForm([plainService], seedOf(PLAIN, { date: '2026-06-15' }));

    await user.click(next());

    expect(await screen.findByText('Nenhum horário disponível')).toBeInTheDocument();
    expect(next()).toBeDisabled();
    expect(await screen.findAllByTestId('day-option')).not.toHaveLength(0);
  });

  it('opens the picker with the link’s resource already chosen', async () => {
    const user = userEvent.setup();
    renderForm([staffService], seedOf(STAFF, { resourceId: 'staff-1' }));

    await user.click(next());

    const options = await screen.findAllByTestId('picker-option');
    const chosen = options.find((option) => option.getAttribute('data-resource-id') === 'staff-1');
    expect(chosen?.querySelector('input')).toBeChecked();
    expect(
      options.find((o) => o.getAttribute('data-resource-id') === 'staff-0')?.querySelector('input'),
    ).not.toBeChecked();
  });

  it('leaves the picker empty when the service no longer offers the link’s resource', async () => {
    const user = userEvent.setup();
    renderForm([staffService], seedOf(STAFF, { resourceId: 'staff-gone' }));

    await user.click(next());

    const options = await screen.findAllByTestId('picker-option');
    for (const option of options) expect(option.querySelector('input')).not.toBeChecked();
    expect(next()).toBeDisabled();
  });

  it('keeps the customer’s own resource choice over the link’s on a second visit to Step 1', async () => {
    const user = userEvent.setup();
    renderForm([staffService], seedOf(STAFF, { resourceId: 'staff-1' }));
    await user.click(next());
    await user.click((await screen.findAllByTestId('picker-option'))[0]!);
    await user.click(screen.getByRole('button', { name: 'Voltar' }));

    await user.click(next());

    const options = await screen.findAllByTestId('picker-option');
    expect(options[0]?.querySelector('input')).toBeChecked();
    expect(options[1]?.querySelector('input')).not.toBeChecked();
  });

  it('opens the duration step on the link’s duration, and the link’s day survives it', async () => {
    const user = userEvent.setup();
    renderForm([variableService], seedOf(VARIABLE, { durationMinutes: 90, date: '2026-06-15' }));

    await user.click(next());

    expect(await screen.findByTestId('duration-select')).toHaveValue('90');
    expect(await screen.findByTestId('duration-total')).toHaveTextContent('Total: R$ 75,00');
    await user.click(next());
    expect(await screen.findByText('09:00–10:00')).toBeInTheDocument();
    expect(fetchAvailability).toHaveBeenCalledWith(
      'lavacar-beloauto',
      '2026-06-15',
      [VARIABLE],
      expect.objectContaining({ durationMinutes: 90 }),
    );
  });
});
