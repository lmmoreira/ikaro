import { uuidv7 } from '../../../../shared/domain/uuid-v7';
import { localDateStartUTC } from '../../../../shared/utils/calendar-date';
import { InMemoryTenantSettingsPort } from '../../../../test/infrastructure/in-memory-tenant-settings.port';
import { InMemoryFeatureRemovalBlockersRepository } from '../../../../test/repositories/booking/in-memory-feature-removal-blockers.repository';
import { GetBookingFeatureRemovalImpactUseCase } from '../../../booking/application/use-cases/get-booking-feature-removal-impact.use-case';
import { TenantSettings } from '../../../platform/domain/value-objects/tenant-settings.vo';
import { BillingBookingAdapter } from './billing-booking.adapter';

const TENANT = '10000000-0000-4000-8000-0000000018d1';
const EFFECTIVE_DATE = '2026-12-15';
const DAY_MS = 24 * 60 * 60 * 1000;

describe('BillingBookingAdapter', () => {
  let blockers: InMemoryFeatureRemovalBlockersRepository;
  let adapter: BillingBookingAdapter;

  beforeEach(() => {
    blockers = new InMemoryFeatureRemovalBlockersRepository();
    const settings = new InMemoryTenantSettingsPort();
    settings.set(TENANT, TenantSettings.default('America/Sao_Paulo').toJSON());
    adapter = new BillingBookingAdapter(
      new GetBookingFeatureRemovalImpactUseCase(blockers, settings),
    );
  });

  it("maps Booking's answer onto Billing's own shape, blockers included", async () => {
    const bookingId = uuidv7();
    const scheduleId = uuidv7();
    blockers.seedBooking({
      tenantId: TENANT,
      id: bookingId,
      status: 'APPROVED',
      scheduledEndAt: new Date(
        localDateStartUTC(EFFECTIVE_DATE, 'America/Sao_Paulo').getTime() + DAY_MS,
      ),
    });
    blockers.seedSchedule({
      tenantId: TENANT,
      id: scheduleId,
      status: 'ACTIVE',
      endsOn: '2026-12-31',
    });

    await expect(adapter.getBookingFeatureRemovalImpact(TENANT, EFFECTIVE_DATE)).resolves.toEqual({
      effectiveFrom: EFFECTIVE_DATE,
      bookings: 1,
      recurringSchedules: 1,
      blockers: [
        { category: 'BOOKING', id: bookingId, date: '2026-12-16' },
        { category: 'RECURRING_SCHEDULE', id: scheduleId, date: '2026-12-31' },
      ],
    });
  });

  it('returns an empty impact, never an error, when nothing blocks', async () => {
    await expect(adapter.getBookingFeatureRemovalImpact(TENANT, EFFECTIVE_DATE)).resolves.toEqual({
      effectiveFrom: EFFECTIVE_DATE,
      bookings: 0,
      recurringSchedules: 0,
      blockers: [],
    });
  });
});
