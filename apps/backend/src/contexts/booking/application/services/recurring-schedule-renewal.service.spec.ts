import { RecurringBookingScheduleBuilder } from '../../../../test/builders/booking/index';
import { InMemoryBookingPlatformPort } from '../../../../test/infrastructure/in-memory-booking-platform.port';
import { InMemoryRecurringBookingScheduleRepository } from '../../../../test/repositories/booking/in-memory-recurring-booking-schedule.repository';
import { RecurringScheduleRenewalService } from './recurring-schedule-renewal.service';

const TENANT = '10000000-0000-4000-8000-000000000501';
const OTHER_TENANT = '10000000-0000-4000-8000-000000000599';
const SERVICE = '20000000-0000-4000-8000-000000000501';
const OTHER_SERVICE = '20000000-0000-4000-8000-000000000502';
// 12:00 UTC is 09:00 in São Paulo, the same calendar day.
const NOW = new Date('2026-10-12T12:00:00.000Z');

function schedule(customerId: string, endsOn: string, startsOn = '2026-08-01', tenantId = TENANT) {
  return new RecurringBookingScheduleBuilder()
    .withTenantId(tenantId)
    .withCustomerId(customerId)
    .withServiceId(SERVICE)
    .withTerm(startsOn, endsOn);
}

describe('RecurringScheduleRenewalService', () => {
  let platform: InMemoryBookingPlatformPort;
  let repo: InMemoryRecurringBookingScheduleRepository;
  let service: RecurringScheduleRenewalService;

  beforeEach(() => {
    platform = new InMemoryBookingPlatformPort();
    platform.seedRecurringRenewalSettings(TENANT, {
      timezone: 'America/Sao_Paulo',
      reminderDays: 7,
    });
    repo = new InMemoryRecurringBookingScheduleRepository();
    service = new RecurringScheduleRenewalService(platform, repo);
  });

  it('marks an ACTIVE schedule ending inside the lead time as renewable', async () => {
    const inside = schedule('customer-a', '2026-10-19').build();
    const later = schedule('customer-b', '2026-10-20').build();
    [inside, later].forEach((s) => repo.seed(s));

    const ids = await service.findRenewableIds(TENANT, [inside, later], NOW);

    expect(ids).toEqual(new Set([inside.id]));
  });

  it('marks an ENDED schedule as renewable', async () => {
    const ended = schedule('customer-a', '2026-09-30').withStatus('ENDED').build();
    repo.seed(ended);

    expect(await service.findRenewableIds(TENANT, [ended], NOW)).toEqual(new Set([ended.id]));
  });

  it.each(['PENDING_APPROVAL', 'CANCELLED'] as const)(
    'never marks a %s schedule as renewable',
    async (status) => {
      const s = schedule('customer-a', '2026-10-15').withStatus(status).build();
      repo.seed(s);

      expect(await service.findRenewableIds(TENANT, [s], NOW)).toEqual(new Set());
    },
  );

  it("uses the tenant's own calendar date: a schedule ending today is renewable at 23:30 local", async () => {
    // 02:30 UTC on the 13th is still the 12th in São Paulo.
    const endsToday = schedule('customer-a', '2026-10-12').build();
    repo.seed(endsToday);

    const ids = await service.findRenewableIds(
      TENANT,
      [endsToday],
      new Date('2026-10-13T02:30:00Z'),
    );

    expect(ids).toEqual(new Set([endsToday.id]));
  });

  it('empties the window of a running schedule when the reminder is off, but keeps ENDED renewable', async () => {
    platform.seedRecurringRenewalSettings(TENANT, {
      timezone: 'America/Sao_Paulo',
      reminderDays: 0,
    });
    const running = schedule('customer-a', '2026-10-13').build();
    const ended = schedule('customer-b', '2026-09-30').withStatus('ENDED').build();
    [running, ended].forEach((s) => repo.seed(s));

    expect(await service.findRenewableIds(TENANT, [running, ended], NOW)).toEqual(
      new Set([ended.id]),
    );
  });

  describe('successor suppression', () => {
    it('is not renewable when the same customer holds an ACTIVE schedule for the same service starting on or after its end', async () => {
      const ending = schedule('customer-a', '2026-10-19').build();
      const successor = schedule('customer-a', '2027-01-15', '2026-10-19').build();
      [ending, successor].forEach((s) => repo.seed(s));

      expect(await service.findRenewableIds(TENANT, [ending], NOW)).toEqual(new Set());
    });

    it('counts a PENDING_APPROVAL successor too', async () => {
      const ended = schedule('customer-a', '2026-09-30').withStatus('ENDED').build();
      const pending = schedule('customer-a', '2027-01-15', '2026-10-01')
        .withStatus('PENDING_APPROVAL')
        .build();
      [ended, pending].forEach((s) => repo.seed(s));

      expect(await service.findRenewableIds(TENANT, [ended], NOW)).toEqual(new Set());
    });

    it.each([
      ['another customer', schedule('customer-b', '2027-01-15', '2026-10-19').build()],
      [
        'another service',
        schedule('customer-a', '2027-01-15', '2026-10-19').withServiceId(OTHER_SERVICE).build(),
      ],
      [
        'a schedule starting before this one ends',
        schedule('customer-a', '2027-01-15', '2026-10-10').build(),
      ],
      [
        'a CANCELLED schedule',
        schedule('customer-a', '2027-01-15', '2026-10-19').withStatus('CANCELLED').build(),
      ],
      [
        'the same customer in another tenant',
        schedule('customer-a', '2027-01-15', '2026-10-19', OTHER_TENANT).build(),
      ],
    ])('does not suppress for %s', async (_label, other) => {
      const ending = schedule('customer-a', '2026-10-19').build();
      [ending, other].forEach((s) => repo.seed(s));

      expect(await service.findRenewableIds(TENANT, [ending], NOW)).toEqual(new Set([ending.id]));
    });
  });

  it('skips every read for an empty batch', async () => {
    const settings = jest.spyOn(platform, 'getRecurringRenewalSettings');

    expect(await service.findRenewableIds(TENANT, [], NOW)).toEqual(new Set());
    expect(settings).not.toHaveBeenCalled();
  });

  it('does not read successors when no schedule is inside the window', async () => {
    const later = schedule('customer-a', '2026-12-01').build();
    const successors = jest.spyOn(repo, 'findSuccessorScheduleIds');

    expect(await service.findRenewableIds(TENANT, [later], NOW)).toEqual(new Set());
    expect(successors).not.toHaveBeenCalled();
  });
});
