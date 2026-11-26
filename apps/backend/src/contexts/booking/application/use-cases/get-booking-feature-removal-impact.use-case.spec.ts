import { uuidv7 } from '../../../../shared/domain/uuid-v7';
import { localDateStartUTC } from '../../../../shared/utils/calendar-date';
import { InMemoryTenantSettingsPort } from '../../../../test/infrastructure/in-memory-tenant-settings.port';
import { InMemoryFeatureRemovalBlockersRepository } from '../../../../test/repositories/booking/in-memory-feature-removal-blockers.repository';
import { TenantSettings } from '../../../platform/domain/value-objects/tenant-settings.vo';
import {
  FEATURE_REMOVAL_BLOCKER_SAMPLE_LIMIT,
  GetBookingFeatureRemovalImpactUseCase,
} from './get-booking-feature-removal-impact.use-case';

const TENANT_A = '10000000-0000-4000-8000-0000000018a1';
const TENANT_B = '10000000-0000-4000-8000-0000000018b1';
const SAO_PAULO = 'America/Sao_Paulo';
const TOKYO = 'Asia/Tokyo'; // UTC+9: its 2026-12-15 starts at 2026-12-14T15:00Z
const EFFECTIVE_DATE = '2026-12-15';
const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;

describe('GetBookingFeatureRemovalImpactUseCase', () => {
  let blockers: InMemoryFeatureRemovalBlockersRepository;
  let settings: InMemoryTenantSettingsPort;
  let useCase: GetBookingFeatureRemovalImpactUseCase;

  // A booking that ends `endsAtOffsetMs` after (negative: before) the start of the effective day in
  // `timezone`.
  const seedBooking = (
    endsAtOffsetMs: number,
    options: {
      tenantId?: string;
      status?: string;
      scheduleId?: string;
      timezone?: string;
    } = {},
  ): string => {
    const id = uuidv7();
    blockers.seedBooking({
      tenantId: options.tenantId ?? TENANT_A,
      id,
      status: options.status ?? 'APPROVED',
      scheduledEndAt: new Date(
        localDateStartUTC(EFFECTIVE_DATE, options.timezone ?? SAO_PAULO).getTime() + endsAtOffsetMs,
      ),
      recurringScheduleId: options.scheduleId ?? null,
    });
    return id;
  };

  const seedSchedule = (endsOn: string, status = 'ACTIVE', tenantId = TENANT_A): string => {
    const id = uuidv7();
    blockers.seedSchedule({ tenantId, id, status, endsOn });
    return id;
  };

  const execute = (tenantId = TENANT_A) =>
    useCase.execute({ tenantId, effectiveDate: EFFECTIVE_DATE });

  beforeEach(() => {
    blockers = new InMemoryFeatureRemovalBlockersRepository();
    settings = new InMemoryTenantSettingsPort();
    settings.set(TENANT_A, TenantSettings.default(SAO_PAULO).toJSON());
    settings.set(TENANT_B, TenantSettings.default(SAO_PAULO).toJSON());
    useCase = new GetBookingFeatureRemovalImpactUseCase(blockers, settings);
  });

  it('answers zero and no blockers for a tenant with nothing past the date', async () => {
    expect(await execute()).toEqual({
      effectiveFrom: EFFECTIVE_DATE,
      bookings: 0,
      recurringSchedules: 0,
      blockers: [],
    });
  });

  describe('the boundary: the local midnight that starts the effective date', () => {
    it('does not count a booking that ends exactly at the boundary, and counts one that ends a minute later', async () => {
      seedBooking(0);
      const aMinuteLater = seedBooking(MINUTE_MS);

      const result = await execute();

      expect(result.bookings).toBe(1);
      expect(result.blockers.map((b) => b.id)).toEqual([aMinuteLater]);
    });

    it('does not count a booking that ended the day before', async () => {
      seedBooking(-DAY_MS);

      expect((await execute()).bookings).toBe(0);
    });

    it("uses the tenant's own timezone: the same instant blocks in one zone and not in another", async () => {
      settings.set(TENANT_B, TenantSettings.default(TOKYO).toJSON());
      // One minute after Tokyo's midnight of the 15th (2026-12-14T15:01Z): blocks a Tokyo tenant...
      seedBooking(MINUTE_MS, { tenantId: TENANT_B, timezone: TOKYO });
      // ...and the very same instant is still the 14th in São Paulo, so it does not block there.
      const sameInstantOffsetFromSaoPauloBoundary =
        localDateStartUTC(EFFECTIVE_DATE, TOKYO).getTime() +
        MINUTE_MS -
        localDateStartUTC(EFFECTIVE_DATE, SAO_PAULO).getTime();
      seedBooking(sameInstantOffsetFromSaoPauloBoundary, { tenantId: TENANT_A });

      expect((await execute(TENANT_B)).bookings).toBe(1);
      expect((await execute(TENANT_A)).bookings).toBe(0);
    });

    it('counts a schedule whose last day is the effective date and not one that ends the day before', async () => {
      const onTheDate = seedSchedule(EFFECTIVE_DATE);
      seedSchedule('2026-12-14');

      const result = await execute();

      expect(result.recurringSchedules).toBe(1);
      expect(result.blockers).toEqual([
        { category: 'RECURRING_SCHEDULE', id: onTheDate, date: EFFECTIVE_DATE },
      ]);
    });
  });

  describe('which records block', () => {
    it('counts PENDING, INFO_REQUESTED and APPROVED bookings and no terminal status', async () => {
      for (const status of ['PENDING', 'INFO_REQUESTED', 'APPROVED']) {
        seedBooking(DAY_MS, { status });
      }
      for (const status of ['COMPLETED', 'REJECTED', 'CANCELLED', 'NO_SHOW']) {
        seedBooking(DAY_MS, { status });
      }

      expect((await execute()).bookings).toBe(3);
    });

    it('counts PENDING_APPROVAL and ACTIVE schedules and no other status', async () => {
      seedSchedule('2026-12-30', 'ACTIVE');
      seedSchedule('2026-12-30', 'PENDING_APPROVAL');
      seedSchedule('2026-12-30', 'ENDED');
      seedSchedule('2026-12-30', 'CANCELLED');

      expect((await execute()).recurringSchedules).toBe(2);
    });

    it('counts the occurrences of a counted schedule once, under the schedule, never as bookings', async () => {
      const scheduleId = seedSchedule('2026-12-30');
      seedBooking(DAY_MS, { scheduleId });
      seedBooking(2 * DAY_MS, { scheduleId });
      const oneOff = seedBooking(3 * DAY_MS);

      const result = await execute();

      expect(result.recurringSchedules).toBe(1);
      expect(result.bookings).toBe(1);
      expect(result.blockers.map((b) => b.id)).toEqual([oneOff, scheduleId]);
    });

    it('still counts the occurrences of a schedule that is not itself counted', async () => {
      const ended = seedSchedule('2026-12-30', 'ENDED');
      const stranded = seedBooking(DAY_MS, { scheduleId: ended });

      const result = await execute();

      expect(result.bookings).toBe(1);
      expect(result.blockers.map((b) => b.id)).toEqual([stranded]);
    });

    it('keeps the final occurrence of a schedule that ended the day before when it runs past the boundary, so no live booking is dropped from both counts', async () => {
      const endedTheDayBefore = seedSchedule('2026-12-14');
      const crossesMidnight = seedBooking(30 * MINUTE_MS, { scheduleId: endedTheDayBefore });

      const result = await execute();

      expect(result.recurringSchedules).toBe(0);
      expect(result.bookings).toBe(1);
      expect(result.blockers).toEqual([
        { category: 'BOOKING', id: crossesMidnight, date: '2026-12-15' },
      ]);
    });
  });

  describe('the named blockers', () => {
    it('lists bookings first, then schedules, each with its tenant-local date and no customer data', async () => {
      // Ends at 21:00 São Paulo time on the effective day itself (boundary + 21 hours).
      const booking = seedBooking(21 * 60 * MINUTE_MS);
      const schedule = seedSchedule('2026-12-31');

      const result = await execute();

      expect(result.blockers).toEqual([
        { category: 'BOOKING', id: booking, date: '2026-12-15' },
        { category: 'RECURRING_SCHEDULE', id: schedule, date: '2026-12-31' },
      ]);
      expect(Object.keys(result.blockers[0]).sort()).toEqual(['category', 'date', 'id']);
    });

    it('caps the list at the sample limit while the counts stay exact', async () => {
      for (let i = 1; i <= FEATURE_REMOVAL_BLOCKER_SAMPLE_LIMIT + 2; i += 1) {
        seedBooking(i * DAY_MS);
      }
      seedSchedule('2026-12-31');

      const result = await execute();

      expect(result.bookings).toBe(FEATURE_REMOVAL_BLOCKER_SAMPLE_LIMIT + 2);
      expect(result.recurringSchedules).toBe(1);
      expect(result.blockers).toHaveLength(FEATURE_REMOVAL_BLOCKER_SAMPLE_LIMIT);
      expect(result.blockers.every((b) => b.category === 'BOOKING')).toBe(true);
    });

    it('returns the same list on every call, ordered by date', async () => {
      for (const day of [3, 1, 2]) seedBooking(day * DAY_MS);

      const first = await execute();
      const second = await execute();

      expect(second).toEqual(first);
      const dates = first.blockers.map((b) => b.date);
      expect(dates).toEqual([...dates].sort());
    });
  });

  it("never counts another tenant's bookings or schedules", async () => {
    seedBooking(DAY_MS, { tenantId: TENANT_B });
    seedSchedule('2026-12-30', 'ACTIVE', TENANT_B);

    expect(await execute()).toEqual({
      effectiveFrom: EFFECTIVE_DATE,
      bookings: 0,
      recurringSchedules: 0,
      blockers: [],
    });
  });
});
