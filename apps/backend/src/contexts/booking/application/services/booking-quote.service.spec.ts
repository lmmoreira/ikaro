import { ServiceBuilder } from '../../../../test/builders/booking/index';
import { BookingDurationOutOfRangeError } from '../../domain/errors/booking-domain.error';
import { BookingQuoteService } from './booking-quote.service';

describe('BookingQuoteService', () => {
  let service: BookingQuoteService;

  beforeEach(() => {
    service = new BookingQuoteService();
  });

  it('passes through the fixed duration/price unchanged for a FIXED-duration service', () => {
    const fixedService = new ServiceBuilder().build();

    const result = service.quote(fixedService, undefined);

    expect(result.durationMinutes).toBe(fixedService.durationMinutes);
    expect(result.priceAtBooking.amount.toNumber()).toBe(fixedService.price.amount.toNumber());
  });

  it('throws when durationMinutes is omitted for a CUSTOMER_SELECTED service (no fallback)', () => {
    const variableService = new ServiceBuilder()
      .withBookingPolicy({
        durationPolicy: 'CUSTOMER_SELECTED',
        durationMinMinutes: 60,
        durationMaxMinutes: 240,
        durationIncrementMinutes: 30,
        pricingPolicy: 'FIXED',
      })
      .build();

    expect(() => service.quote(variableService, undefined)).toThrow(BookingDurationOutOfRangeError);
  });

  it('throws when the requested duration is outside min/max', () => {
    const variableService = new ServiceBuilder()
      .withBookingPolicy({
        durationPolicy: 'CUSTOMER_SELECTED',
        durationMinMinutes: 60,
        durationMaxMinutes: 240,
        durationIncrementMinutes: 30,
        pricingPolicy: 'FIXED',
      })
      .build();

    expect(() => service.quote(variableService, 30)).toThrow(BookingDurationOutOfRangeError);
    expect(() => service.quote(variableService, 300)).toThrow(BookingDurationOutOfRangeError);
  });

  it('throws when the requested duration is not a valid increment step', () => {
    const variableService = new ServiceBuilder()
      .withBookingPolicy({
        durationPolicy: 'CUSTOMER_SELECTED',
        durationMinMinutes: 60,
        durationMaxMinutes: 240,
        durationIncrementMinutes: 30,
        pricingPolicy: 'FIXED',
      })
      .build();

    expect(() => service.quote(variableService, 70)).toThrow(BookingDurationOutOfRangeError);
  });

  it('accepts a valid duration and keeps the fixed price when pricingPolicy stays FIXED', () => {
    const variableService = new ServiceBuilder()
      .withBookingPolicy({
        durationPolicy: 'CUSTOMER_SELECTED',
        durationMinMinutes: 60,
        durationMaxMinutes: 240,
        durationIncrementMinutes: 30,
        pricingPolicy: 'FIXED',
      })
      .build();

    const result = service.quote(variableService, 120);

    expect(result.durationMinutes).toBe(120);
    expect(result.priceAtBooking.amount.toNumber()).toBe(variableService.price.amount.toNumber());
  });

  it('rounds up to the correct increment for PER_TIME_INCREMENT pricing', () => {
    const variableService = new ServiceBuilder()
      .withBookingPolicy({
        durationPolicy: 'CUSTOMER_SELECTED',
        durationMinMinutes: 30,
        durationMaxMinutes: 240,
        durationIncrementMinutes: 30,
        pricingPolicy: 'PER_TIME_INCREMENT',
        pricingIncrementMinutes: 60,
        pricePerIncrementAmount: 50,
        minimumChargeAmount: null,
      })
      .build();

    // 90 minutes = 1.5 pricing increments of 60 -> rounds up to 2 -> 2 * 50 = 100
    const result = service.quote(variableService, 90);

    expect(result.priceAtBooking.amount.toNumber()).toBe(100);
  });

  it('applies the minimum charge when the computed price is lower', () => {
    const variableService = new ServiceBuilder()
      .withBookingPolicy({
        durationPolicy: 'CUSTOMER_SELECTED',
        durationMinMinutes: 30,
        durationMaxMinutes: 240,
        durationIncrementMinutes: 30,
        pricingPolicy: 'PER_TIME_INCREMENT',
        pricingIncrementMinutes: 60,
        pricePerIncrementAmount: 50,
        minimumChargeAmount: 200,
      })
      .build();

    // 30 minutes -> 1 increment -> 50, floored to the 200 minimum
    const result = service.quote(variableService, 30);

    expect(result.priceAtBooking.amount.toNumber()).toBe(200);
  });

  it('does not apply the minimum charge when the computed price already exceeds it', () => {
    const variableService = new ServiceBuilder()
      .withBookingPolicy({
        durationPolicy: 'CUSTOMER_SELECTED',
        durationMinMinutes: 30,
        durationMaxMinutes: 240,
        durationIncrementMinutes: 30,
        pricingPolicy: 'PER_TIME_INCREMENT',
        pricingIncrementMinutes: 60,
        pricePerIncrementAmount: 50,
        minimumChargeAmount: 50,
      })
      .build();

    // 180 minutes -> 3 increments -> 150, well above the 50 minimum
    const result = service.quote(variableService, 180);

    expect(result.priceAtBooking.amount.toNumber()).toBe(150);
  });
});
