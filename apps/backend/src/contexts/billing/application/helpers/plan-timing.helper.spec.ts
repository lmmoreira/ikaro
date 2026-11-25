import { localDateEndUTC, localDateStartUTC } from '../../../../shared/utils/calendar-date';
import { ChargeBuilder, SubscriptionBuilder } from '../../../../test/builders/billing';
import { InMemoryChargeRepository } from '../../../../test/repositories/billing/in-memory-charge.repository';
import { pricingDate, readNextPeriodPaid } from './plan-timing.helper';

const ZONE = 'America/Sao_Paulo';
const TODAY = '2026-11-12';

describe('plan timing helpers (UC-136 A7)', () => {
  let charges: InMemoryChargeRepository;

  beforeEach(() => {
    charges = new InMemoryChargeRepository();
  });

  const active = () =>
    new SubscriptionBuilder()
      .withStatus('ACTIVE')
      .withTimezone(ZONE)
      .withCurrentPeriod(new Date('2026-10-20T03:00:00Z'), localDateEndUTC('2026-11-19', ZONE))
      .build();

  const trial = () =>
    new SubscriptionBuilder()
      .withStatus('TRIALING')
      .withTimezone(ZONE)
      .withAnchorDay(20)
      .withTrialEndsAt(localDateStartUTC('2026-11-20', ZONE))
      .build();

  const chargeFor = (
    subscription: { tenantId: string; id: string },
    periodStart: string,
    periodEnd: string,
  ) =>
    new ChargeBuilder()
      .withTenantId(subscription.tenantId)
      .withSubscriptionId(subscription.id)
      .withPeriod(periodStart, periodEnd);

  describe('readNextPeriodPaid', () => {
    it('is true when the earliest invoice after today is paid', async () => {
      const subscription = active();
      await charges.save(
        chargeFor(subscription, '2026-11-20', '2026-12-19')
          .withPaid('PIX', new Date('2026-11-10T12:00:00Z'))
          .build(),
      );

      await expect(readNextPeriodPaid(charges, subscription, TODAY)).resolves.toBe(true);
    });

    it.each(['PENDING', 'OVERDUE', 'CANCELED'] as const)(
      'is false when that invoice is %s',
      async (status) => {
        const subscription = active();
        await charges.save(
          chargeFor(subscription, '2026-11-20', '2026-12-19').withStatus(status).build(),
        );

        await expect(readNextPeriodPaid(charges, subscription, TODAY)).resolves.toBe(false);
      },
    );

    it('ignores the period that is running now: only a period starting after today counts', async () => {
      const subscription = active();
      await charges.save(
        chargeFor(subscription, '2026-10-20', '2026-11-19')
          .withPaid('PIX', new Date('2026-10-10T12:00:00Z'))
          .build(),
      );

      await expect(readNextPeriodPaid(charges, subscription, TODAY)).resolves.toBe(false);
    });

    it('reads the first invoice of a trial, which starts on the trial’s end day', async () => {
      const subscription = trial();
      await charges.save(
        chargeFor(subscription, '2026-11-20', '2026-12-19')
          .withPaid('PIX', new Date('2026-11-10T12:00:00Z'))
          .build(),
      );

      await expect(readNextPeriodPaid(charges, subscription, TODAY)).resolves.toBe(true);
    });

    it('is false with no invoice at all', async () => {
      await expect(readNextPeriodPaid(charges, active(), TODAY)).resolves.toBe(false);
    });

    it('never counts another tenant’s paid invoice', async () => {
      const subscription = active();
      await charges.save(
        new ChargeBuilder()
          .withPeriod('2026-11-20', '2026-12-19')
          .withPaid('PIX', new Date('2026-11-10T12:00:00Z'))
          .build(),
      );

      await expect(readNextPeriodPaid(charges, subscription, TODAY)).resolves.toBe(false);
    });

    it.each([
      [
        'suspended',
        new SubscriptionBuilder()
          .withStatus('SUSPENDED')
          .withSuspension('NON_PAYMENT', new Date('2026-11-01T12:00:00Z'))
          .build(),
      ],
      ['exempt', new SubscriptionBuilder().withStatus('ACTIVE').withExempt(true).build()],
    ])('is false, without a lookup, when %s', async (_label, subscription) => {
      const lookup = jest.spyOn(charges, 'findFirstPeriodCharge');

      await expect(readNextPeriodPaid(charges, subscription, TODAY)).resolves.toBe(false);
      expect(lookup).not.toHaveBeenCalled();
    });
  });

  describe('pricingDate', () => {
    it('is the next period start while one is named', () => {
      expect(pricingDate(active(), false, TODAY).value).toBe('2026-11-20');
    });

    it('is today while no period is named (a payment suspension prices the recovery charge today)', () => {
      const suspended = new SubscriptionBuilder()
        .withStatus('SUSPENDED')
        .withSuspension('NON_PAYMENT', new Date('2026-11-01T12:00:00Z'))
        .build();

      expect(pricingDate(suspended, false, TODAY).value).toBe(TODAY);
    });
  });
});
