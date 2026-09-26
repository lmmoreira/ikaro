import { BookingBuilder, BookingLineBuilder } from '../../../../test/builders/booking/index';
import { ServiceBuilder } from '../../../../test/builders/booking/service.builder';
import { InMemoryBookingQuoteRevisionRepository } from '../../../../test/repositories/booking/in-memory-booking-quote-revision.repository';
import { Money } from '../../../../shared/value-objects/money';
import { Service } from '../../domain/service.aggregate';
import { BookingQuoteService } from '../services/booking-quote.service';
import {
  recordQuoteRevisionIfPriceChanged,
  resolveEffectiveRescheduleWindowHours,
  resolveRescheduleDurationChange,
} from './reschedule-quote.helpers';

const TENANT_ID = '10000000-0000-4000-8000-000000000701';
const BOOKING_ID = '20000000-0000-4000-8000-000000000701';

function variableService(
  overrides: {
    rescheduleWindowHoursOverride?: number | null;
  } = {},
): { serviceId: string; service: Service } {
  const serviceId = '30000000-0000-4000-8000-000000000701';
  const service = new ServiceBuilder()
    .withId(serviceId)
    .withTenantId(TENANT_ID)
    .withPrice(Money.from(50, 'BRL'))
    .withDurationMinutes(30)
    .withBookingPolicy({
      durationPolicy: 'CUSTOMER_SELECTED',
      durationMinMinutes: 30,
      durationMaxMinutes: 120,
      durationIncrementMinutes: 30,
      pricingPolicy: 'PER_TIME_INCREMENT',
      pricingIncrementMinutes: 30,
      pricePerIncrementAmount: 50,
      ...overrides,
    })
    .build();
  return { serviceId, service };
}

describe('resolveRescheduleDurationChange', () => {
  it('returns undefined when durationMinutes is not supplied', () => {
    const { serviceId, service } = variableService();
    const line = new BookingLineBuilder().withServiceId(serviceId).build();
    const booking = new BookingBuilder().withLines([line]).build();

    const result = resolveRescheduleDurationChange(
      booking,
      new Map([[serviceId, service]]),
      new BookingQuoteService(),
      undefined,
    );

    expect(result).toBeUndefined();
  });

  it('returns undefined when no line is durationPolicy=CUSTOMER_SELECTED (mismatched submission ignored)', () => {
    const serviceId = '30000000-0000-4000-8000-000000000702';
    const fixedService = new ServiceBuilder().withId(serviceId).withTenantId(TENANT_ID).build();
    const line = new BookingLineBuilder().withServiceId(serviceId).build();
    const booking = new BookingBuilder().withLines([line]).build();

    const result = resolveRescheduleDurationChange(
      booking,
      new Map([[serviceId, fixedService]]),
      new BookingQuoteService(),
      90,
    );

    expect(result).toBeUndefined();
  });

  it('quotes the CUSTOMER_SELECTED line and returns the new duration + price', () => {
    const { serviceId, service } = variableService();
    const line = new BookingLineBuilder()
      .withServiceId(serviceId)
      .withDurationMinsAtBooking(30)
      .withPriceAtBooking(Money.from(50, 'BRL'))
      .build();
    const booking = new BookingBuilder().withLines([line]).build();

    const result = resolveRescheduleDurationChange(
      booking,
      new Map([[serviceId, service]]),
      new BookingQuoteService(),
      90,
    );

    expect(result).toEqual({
      lineId: line.lineId,
      durationMinutes: 90,
      priceAtBooking: expect.objectContaining({ currency: 'BRL' }),
    });
    expect(result!.priceAtBooking.amount.toFixed(2)).toBe('150.00');
  });
});

describe('resolveEffectiveRescheduleWindowHours', () => {
  it('falls back to the tenant default when no line service has an override', () => {
    const serviceId = '30000000-0000-4000-8000-000000000703';
    const service = new ServiceBuilder().withId(serviceId).withTenantId(TENANT_ID).build();
    const line = new BookingLineBuilder().withServiceId(serviceId).build();
    const booking = new BookingBuilder().withLines([line]).build();

    expect(
      resolveEffectiveRescheduleWindowHours(booking, new Map([[serviceId, service]]), 48),
    ).toBe(48);
  });

  it('uses the MAX override across a multi-line basket', () => {
    const serviceAId = '30000000-0000-4000-8000-000000000704';
    const serviceBId = '30000000-0000-4000-8000-000000000705';
    const serviceA = new ServiceBuilder()
      .withId(serviceAId)
      .withTenantId(TENANT_ID)
      .withBookingPolicy({ rescheduleWindowHoursOverride: 12 })
      .build();
    const serviceB = new ServiceBuilder()
      .withId(serviceBId)
      .withTenantId(TENANT_ID)
      .withBookingPolicy({ rescheduleWindowHoursOverride: 72 })
      .build();
    const lineA = new BookingLineBuilder().withServiceId(serviceAId).build();
    const lineB = new BookingLineBuilder().withServiceId(serviceBId).build();
    const booking = new BookingBuilder().withLines([lineA, lineB]).build();

    expect(
      resolveEffectiveRescheduleWindowHours(
        booking,
        new Map([
          [serviceAId, serviceA],
          [serviceBId, serviceB],
        ]),
        48,
      ),
    ).toBe(72);
  });
});

describe('recordQuoteRevisionIfPriceChanged', () => {
  let repo: InMemoryBookingQuoteRevisionRepository;

  beforeEach(() => {
    repo = new InMemoryBookingQuoteRevisionRepository();
  });

  it('returns undefined and records nothing when the price is unchanged', async () => {
    const result = await recordQuoteRevisionIfPriceChanged(
      repo,
      TENANT_ID,
      BOOKING_ID,
      Money.from(100, 'BRL'),
      Money.from(100, 'BRL'),
      'CUSTOMER',
      'customer-1',
    );

    expect(result).toBeUndefined();
    expect(repo.all()).toHaveLength(0);
  });

  it('records revision_no=1 for the first revision, increments on a second', async () => {
    const first = await recordQuoteRevisionIfPriceChanged(
      repo,
      TENANT_ID,
      BOOKING_ID,
      Money.from(100, 'BRL'),
      Money.from(150, 'BRL'),
      'CUSTOMER',
      'customer-1',
    );
    expect(first).toEqual({ revisionNo: 1, amount: { amount: '150.00', currency: 'BRL' } });

    const second = await recordQuoteRevisionIfPriceChanged(
      repo,
      TENANT_ID,
      BOOKING_ID,
      Money.from(150, 'BRL'),
      Money.from(200, 'BRL'),
      'STAFF',
      'staff-1',
    );
    expect(second).toEqual({ revisionNo: 2, amount: { amount: '200.00', currency: 'BRL' } });
    expect(repo.all()).toHaveLength(2);
  });
});
