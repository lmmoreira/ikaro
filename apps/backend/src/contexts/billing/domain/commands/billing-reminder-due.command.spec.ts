import { BillingReminderDueCommandBuilder } from '../../../../test/builders/billing';

describe('BillingReminderDue', () => {
  const base = () =>
    new BillingReminderDueCommandBuilder()
      .withTenantId('tenant-1')
      .withSubscriptionId('sub-1')
      .withKind('CHARGE_DUE_SOON')
      .withDaysOffset(3)
      .withChargeId('charge-1');

  it('keys its dedup on the tenant, subscription, kind, offset and charge', () => {
    expect(base().build().dedupKey).toBe(
      'BillingReminderDue:tenant-1:sub-1:CHARGE_DUE_SOON:3:charge-1',
    );
  });

  it('keys a trial reminder, which names no charge, on the local date the trial ends', () => {
    const trial = base()
      .withKind('TRIAL_ENDING')
      .withDaysOffset(7)
      .withChargeId(null)
      .withTrialEndsOn('2026-12-17');

    expect(trial.build().dedupKey).toBe(
      'BillingReminderDue:tenant-1:sub-1:TRIAL_ENDING:7:2026-12-17',
    );
  });

  it('gives a second trial on the same subscription its own key, and a retry inside one trial the same key', () => {
    const trial = (endsOn: string, email: string | null) =>
      base()
        .withKind('PLAN_CONFIRMATION')
        .withDaysOffset(7)
        .withChargeId(null)
        .withTrialEndsOn(endsOn)
        .withRecipientEmail(email)
        .build().dedupKey;

    expect(trial('2026-12-17', 'a@example.test')).toBe(trial('2026-12-17', null));
    expect(trial('2026-12-17', null)).not.toBe(trial('2027-03-01', null));
  });

  it('prefers the charge id over the trial end date', () => {
    expect(base().withTrialEndsOn('2026-12-17').build().dedupKey).toBe(
      'BillingReminderDue:tenant-1:sub-1:CHARGE_DUE_SOON:3:charge-1',
    );
  });

  it('uses a stable placeholder when there is no charge and no trial', () => {
    expect(base().withChargeId(null).build().dedupKey).toBe(
      'BillingReminderDue:tenant-1:sub-1:CHARGE_DUE_SOON:3:none',
    );
  });

  it('has the same key whatever the recipient, link or correlation id', () => {
    const first = base().withRecipientEmail('a@example.test').withCorrelationId('corr-a').build();
    const second = base()
      .withRecipientEmail(null)
      .withPaymentUrl(null)
      .withDueDate(null)
      .withSuspendsOn('2026-12-31')
      .withAmount(null, null)
      .withCorrelationId('corr-b')
      .build();

    expect(first.dedupKey).toBe(second.dedupKey);
  });

  it.each([
    ['another tenant', base().withTenantId('tenant-2')],
    ['another subscription', base().withSubscriptionId('sub-2')],
    ['another kind', base().withKind('CHARGE_OVERDUE')],
    ['another offset', base().withDaysOffset(1)],
    ['another charge', base().withChargeId('charge-2')],
  ])('has a different key for %s', (_label, other) => {
    expect(other.build().dedupKey).not.toBe(base().build().dedupKey);
  });

  it('carries the full envelope and exactly the documented data', () => {
    const command = base().build();

    expect(command).toMatchObject({
      eventName: 'BillingReminderDue',
      eventVersion: 1,
      tenantId: 'tenant-1',
    });
    expect(Object.keys(command.data).sort()).toEqual([
      'amountMinor',
      'chargeId',
      'currency',
      'daysOffset',
      'dueDate',
      'kind',
      'paymentUrl',
      'recipientEmail',
      'subscriptionId',
      'suspendsOn',
      'trialEndsOn',
    ]);
  });
});
