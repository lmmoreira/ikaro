import { LoyaltyBalanceBuilder } from '../../../../test/builders/loyalty/index';
import { AppLogger } from '../../../../shared/observability/app-logger';
import {
  DiscountSettlementSource,
  logDiscountShortfall,
  settleDiscount,
} from './discount-settlement.helpers';

const TENANT_ID = '00000000-0000-7000-8000-000000000001';
const CUSTOMER_ID = '00000000-0000-7000-8000-000000000002';
const BOOKING_ID = '00000000-0000-7000-8000-000000000003';
const EVENT_ID = '00000000-0000-7000-8000-000000000010';
const STAFF_ID = '00000000-0000-7000-8000-000000000050';
const RATE = 10;

const source: DiscountSettlementSource = {
  tenantId: TENANT_ID,
  eventId: EVENT_ID,
  bookingId: BOOKING_ID,
  completedBy: STAFF_ID,
};

const balanceWith = (currentPoints: number) =>
  new LoyaltyBalanceBuilder()
    .withTenantId(TENANT_ID)
    .withCustomerId(CUSTOMER_ID)
    .withCurrentPoints(currentPoints)
    .build();

describe('settleDiscount()', () => {
  it('redeems the whole discount and leaves the rest when the balance covers it', () => {
    const balance = balanceWith(500);

    const redemption = settleDiscount(balance, source, CUSTOMER_ID, 100, RATE);

    expect(redemption?.pointsRedeemed).toBe(100);
    expect(balance.currentPoints).toBe(400);
  });

  it('copies the settlement context onto the redemption', () => {
    const redemption = settleDiscount(balanceWith(500), source, CUSTOMER_ID, 100, RATE);

    expect(redemption).toEqual(
      expect.objectContaining({
        tenantId: TENANT_ID,
        customerId: CUSTOMER_ID,
        pointsPerCurrencyUnit: RATE,
        redeemedBy: STAFF_ID,
        bookingId: BOOKING_ID,
      }),
    );
  });

  it('redeems exactly the balance when it equals the discount', () => {
    const balance = balanceWith(100);

    const redemption = settleDiscount(balance, source, CUSTOMER_ID, 100, RATE);

    expect(redemption?.pointsRedeemed).toBe(100);
    expect(balance.currentPoints).toBe(0);
  });

  it('redeems only what the balance has when the discount is larger', () => {
    const balance = balanceWith(40);

    const redemption = settleDiscount(balance, source, CUSTOMER_ID, 100, RATE);

    expect(redemption?.pointsRedeemed).toBe(40);
    expect(balance.currentPoints).toBe(0);
  });

  it('returns no redemption when nothing is covered, because a redemption needs positive points', () => {
    const balance = balanceWith(0);

    expect(settleDiscount(balance, source, CUSTOMER_ID, 100, RATE)).toBeNull();
    expect(balance.currentPoints).toBe(0);
  });

  it.each([0, -5])(
    'returns no redemption and leaves the balance alone when pointsUsed is %i',
    (pointsUsed) => {
      const balance = balanceWith(500);

      expect(settleDiscount(balance, source, CUSTOMER_ID, pointsUsed, RATE)).toBeNull();
      expect(balance.currentPoints).toBe(500);
    },
  );
});

describe('logDiscountShortfall()', () => {
  let warnSpy: jest.SpyInstance;
  const logger = new AppLogger('DiscountSettlementHelpersSpec');

  beforeEach(() => {
    warnSpy = jest.spyOn(AppLogger.prototype, 'warn').mockImplementation();
  });

  afterEach(() => jest.restoreAllMocks());

  it('logs one warning with the full shortfall payload when less than the discount was redeemed', () => {
    logDiscountShortfall(logger, source, CUSTOMER_ID, 100, 55);

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith(
      'Points discount exceeded the balance: settled what the balance covered',
      {
        tenantId: TENANT_ID,
        customerId: CUSTOMER_ID,
        bookingId: BOOKING_ID,
        eventId: EVENT_ID,
        pointsUsed: 100,
        pointsRedeemed: 55,
        pointsShortfall: 45,
      },
    );
  });

  it('logs the whole discount as the shortfall when nothing was redeemed', () => {
    logDiscountShortfall(logger, source, CUSTOMER_ID, 100, 0);

    expect(warnSpy).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ pointsRedeemed: 0, pointsShortfall: 100 }),
    );
  });

  it('logs nothing when the whole discount was redeemed', () => {
    logDiscountShortfall(logger, source, CUSTOMER_ID, 100, 100);

    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('logs nothing when no discount was used', () => {
    logDiscountShortfall(logger, source, CUSTOMER_ID, 0, 0);

    expect(warnSpy).not.toHaveBeenCalled();
  });
});
