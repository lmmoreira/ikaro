import { RecurringScheduleRenewalDueCommandBuilder } from '../../../../test/builders/booking/index';

describe('RecurringScheduleRenewalDue', () => {
  const base = () =>
    new RecurringScheduleRenewalDueCommandBuilder()
      .withTenantId('tenant-1')
      .withRecurringScheduleId('schedule-1');

  it('keys its dedup on the tenant, the schedule and the local date', () => {
    expect(base().withLocalDate('2026-10-12').build().dedupKey).toBe(
      'RecurringScheduleRenewalDue:tenant-1:schedule-1:2026-10-12',
    );
  });

  it('has a stable key for the same tenant, schedule and date', () => {
    const first = base().withLocalDate('2026-10-12').withCorrelationId('corr-a').build();
    const second = base().withLocalDate('2026-10-12').withCorrelationId('corr-b').build();

    expect(first.dedupKey).toBe(second.dedupKey);
  });

  it.each([
    ['another date', base().withLocalDate('2026-10-13')],
    ['another schedule', base().withRecurringScheduleId('schedule-2')],
    ['another tenant', base().withTenantId('tenant-2')],
  ])('has a different key for %s', (_label, other) => {
    expect(other.build().dedupKey).not.toBe(base().withLocalDate('2026-10-12').build().dedupKey);
  });

  it('carries ids and the schedule pattern, not the customer email', () => {
    const { data } = base().build();

    expect(Object.keys(data).sort()).toEqual([
      'customerId',
      'daysOfWeek',
      'endsOn',
      'recurringScheduleId',
      'serviceId',
      'startTime',
      'startsOn',
    ]);
  });
});
