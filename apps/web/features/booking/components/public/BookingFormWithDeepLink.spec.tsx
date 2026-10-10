// @vitest-environment jsdom
import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { HotsiteAddressSpec } from '@ikaro/types';
import { makeHotsiteService } from '@/test-utils';
import { BookingFormWithDeepLink } from './BookingFormWithDeepLink';
import type { BookingFormProps } from './BookingForm';

const SERVICE_ID = '10000000-0000-4000-8000-000000000001';
const OTHER_TENANT_SERVICE_ID = '10000000-0000-4000-8000-000000000099';

const searchParams = vi.hoisted(() => ({ current: new URLSearchParams() }));
const formProps = vi.hoisted(() => ({ calls: [] as BookingFormProps[] }));

vi.mock('next/navigation', () => ({ useSearchParams: () => searchParams.current }));

vi.mock('./BookingForm', () => ({
  BookingForm: (props: BookingFormProps) => {
    formProps.calls.push(props);
    return <div data-testid="booking-form" />;
  },
}));

const services = [
  makeHotsiteService({ id: SERVICE_ID, name: 'Corte' }),
  makeHotsiteService({
    id: '10000000-0000-4000-8000-000000000002',
    name: 'Aula',
    bookingModel: 'SESSION',
  }),
];

const props = {
  slug: 'lavacar',
  services,
  carouselDays: 14,
  datePickerType: 'carousel',
  maxBookingAdvanceDays: 90,
  timezone: 'UTC',
  phonePrefix: '+55',
  addressSpec: {} as HotsiteAddressSpec,
} satisfies Omit<BookingFormProps, 'seed'>;

const lastSeed = () => formProps.calls.at(-1)?.seed;

beforeEach(() => {
  formProps.calls = [];
  searchParams.current = new URLSearchParams();
});

describe('BookingFormWithDeepLink', () => {
  it('renders the plain booking form with no seed when the page has no query string', () => {
    render(<BookingFormWithDeepLink {...props} />);

    expect(formProps.calls).toHaveLength(1);
    expect(lastSeed()).toBeNull();
    expect(formProps.calls[0]).toMatchObject(props);
  });

  it('seeds the form from a valid link', () => {
    searchParams.current = new URLSearchParams(`serviceId=${SERVICE_ID}`);

    render(<BookingFormWithDeepLink {...props} />);

    expect(lastSeed()).toEqual({
      serviceId: SERVICE_ID,
      date: null,
      durationMinutes: null,
      resourceId: null,
    });
  });

  it('ignores a service that belongs to no appointment this page offers (another tenant’s)', () => {
    searchParams.current = new URLSearchParams(`serviceId=${OTHER_TENANT_SERVICE_ID}`);

    render(<BookingFormWithDeepLink {...props} />);

    expect(lastSeed()).toBeNull();
  });

  it('ignores a link to a service the booking flow does not offer (a session)', () => {
    searchParams.current = new URLSearchParams('serviceId=10000000-0000-4000-8000-000000000002');

    render(<BookingFormWithDeepLink {...props} />);

    expect(lastSeed()).toBeNull();
  });

  it('ignores a malformed link without failing', () => {
    searchParams.current = new URLSearchParams('serviceId=nope&date=also-nope');

    render(<BookingFormWithDeepLink {...props} />);

    expect(lastSeed()).toBeNull();
  });
});
