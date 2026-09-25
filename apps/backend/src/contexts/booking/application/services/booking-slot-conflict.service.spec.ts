import { InMemoryResourceOccupancyRepository } from '../../../../test/repositories/booking/in-memory-resource-occupancy.repository';
import { InMemoryTenantLock } from '../../../../test/infrastructure/in-memory-tenant-lock';
import { futureDate } from '../../../../test/utils/date-helpers';
import { ResourceType } from '../../domain/resource.types';
import {
  BookingBundlePartiallyUnavailableError,
  BookingLegUnavailableError,
  BookingSlotUnavailableError,
} from '../../domain/errors/booking-domain.error';
import { ResourceOccupancyCandidate } from '../ports/resource-occupancy-repository.port';
import { BookingSlotConflictService } from './booking-slot-conflict.service';

const TENANT_ID = '10000000-0000-4000-8000-000000000300';
const RESOURCE_ID = '20000000-0000-4000-8000-000000000300';
const scheduledAt = new Date(`${futureDate(5)}T13:00:00.000Z`);

function candidate(
  startsAt: Date,
  endsAt: Date,
  overrides: Partial<ResourceOccupancyCandidate> = {},
): ResourceOccupancyCandidate {
  return {
    resourceId: RESOURCE_ID,
    resourceType: ResourceType.LOCATION,
    resourceName: 'Localização Principal',
    legIndex: null,
    quantityPosition: null,
    startsAt,
    endsAt,
    selectionMode: 'NONE',
    ...overrides,
  };
}

describe('BookingSlotConflictService', () => {
  let occupancyRepo: InMemoryResourceOccupancyRepository;
  let service: BookingSlotConflictService;

  beforeEach(() => {
    occupancyRepo = new InMemoryResourceOccupancyRepository();
    service = new BookingSlotConflictService(occupancyRepo, new InMemoryTenantLock());
  });

  it('resolves when there are no candidates', async () => {
    await expect(service.assertSlotFree(TENANT_ID, [])).resolves.toBeUndefined();
  });

  it('resolves when no existing occupancy', async () => {
    const endsAt = new Date(scheduledAt.getTime() + 30 * 60_000);
    await expect(
      service.assertSlotFree(TENANT_ID, [candidate(scheduledAt, endsAt)]),
    ).resolves.toBeUndefined();
  });

  it('throws BookingSlotUnavailableError when a candidate exactly overlaps existing occupancy', async () => {
    const existingEnd = new Date(scheduledAt.getTime() + 60 * 60_000);
    occupancyRepo.seed(TENANT_ID, 'other-line', candidate(scheduledAt, existingEnd));

    const endsAt = new Date(scheduledAt.getTime() + 30 * 60_000);
    await expect(
      service.assertSlotFree(TENANT_ID, [candidate(scheduledAt, endsAt)]),
    ).rejects.toThrow(BookingSlotUnavailableError);
  });

  it('throws when the new window starts inside an existing occupied window', async () => {
    const existingStart = new Date(scheduledAt.getTime() - 15 * 60_000);
    const existingEnd = new Date(scheduledAt.getTime() + 45 * 60_000);
    occupancyRepo.seed(TENANT_ID, 'other-line', candidate(existingStart, existingEnd));

    const endsAt = new Date(scheduledAt.getTime() + 30 * 60_000);
    await expect(
      service.assertSlotFree(TENANT_ID, [candidate(scheduledAt, endsAt)]),
    ).rejects.toThrow(BookingSlotUnavailableError);
  });

  it('allows a candidate whose window comes after an existing one (non-overlapping)', async () => {
    const existingEnd = new Date(scheduledAt.getTime());
    occupancyRepo.seed(
      TENANT_ID,
      'other-line',
      candidate(new Date(scheduledAt.getTime() - 30 * 60_000), existingEnd),
    );

    const endsAt = new Date(scheduledAt.getTime() + 30 * 60_000);
    await expect(
      service.assertSlotFree(TENANT_ID, [candidate(scheduledAt, endsAt)]),
    ).resolves.toBeUndefined();
  });

  it('allows a candidate whose window comes before an existing one (non-overlapping)', async () => {
    const endsAt = new Date(scheduledAt.getTime() + 30 * 60_000);
    occupancyRepo.seed(
      TENANT_ID,
      'other-line',
      candidate(endsAt, new Date(endsAt.getTime() + 30 * 60_000)),
    );

    await expect(
      service.assertSlotFree(TENANT_ID, [candidate(scheduledAt, endsAt)]),
    ).resolves.toBeUndefined();
  });

  it('excludes the specified bookingId from the conflict check (self-overlap, UC-060 A2)', async () => {
    const BOOKING_LINE_ID = 'aaaaaaaa-0000-4000-8000-000000000001';
    const existingEnd = new Date(scheduledAt.getTime() + 60 * 60_000);
    occupancyRepo.seed(TENANT_ID, BOOKING_LINE_ID, candidate(scheduledAt, existingEnd));

    const endsAt = new Date(scheduledAt.getTime() + 30 * 60_000);
    await expect(
      service.assertSlotFree(TENANT_ID, [candidate(scheduledAt, endsAt)], [BOOKING_LINE_ID]),
    ).resolves.toBeUndefined();
  });

  it('still detects a conflict from a different booking when excludeBookingId is set', async () => {
    const OTHER_LINE_ID = 'bbbbbbbb-0000-4000-8000-000000000002';
    const existingEnd = new Date(scheduledAt.getTime() + 60 * 60_000);
    occupancyRepo.seed(TENANT_ID, OTHER_LINE_ID, candidate(scheduledAt, existingEnd));

    const endsAt = new Date(scheduledAt.getTime() + 30 * 60_000);
    await expect(
      service.assertSlotFree(
        TENANT_ID,
        [candidate(scheduledAt, endsAt)],
        ['aaaaaaaa-0000-4000-8000-000000000001'],
      ),
    ).rejects.toThrow(BookingSlotUnavailableError);
  });

  describe('error granularity (M23-S01, UC-064 A2 / UC-065 A1)', () => {
    const RESOURCE_ID_2 = '30000000-0000-4000-8000-000000000300';

    it('throws BookingLegUnavailableError when the conflicting candidate has a legIndex', async () => {
      const existingEnd = new Date(scheduledAt.getTime() + 60 * 60_000);
      occupancyRepo.seed(TENANT_ID, 'other-line', candidate(scheduledAt, existingEnd));

      const endsAt = new Date(scheduledAt.getTime() + 30 * 60_000);
      await expect(
        service.assertSlotFree(TENANT_ID, [candidate(scheduledAt, endsAt, { legIndex: 0 })]),
      ).rejects.toThrow(BookingLegUnavailableError);
    });

    it('throws BookingBundlePartiallyUnavailableError when more than one flat candidate is in play, even if only one conflicts', async () => {
      const existingEnd = new Date(scheduledAt.getTime() + 60 * 60_000);
      occupancyRepo.seed(TENANT_ID, 'other-line', candidate(scheduledAt, existingEnd));

      const endsAt = new Date(scheduledAt.getTime() + 30 * 60_000);
      await expect(
        service.assertSlotFree(TENANT_ID, [
          candidate(scheduledAt, endsAt),
          candidate(scheduledAt, endsAt, { resourceId: RESOURCE_ID_2 }),
        ]),
      ).rejects.toThrow(BookingBundlePartiallyUnavailableError);
    });

    it('throws the generic BookingSlotUnavailableError for a single flat, non-legged candidate', async () => {
      const existingEnd = new Date(scheduledAt.getTime() + 60 * 60_000);
      occupancyRepo.seed(TENANT_ID, 'other-line', candidate(scheduledAt, existingEnd));

      const endsAt = new Date(scheduledAt.getTime() + 30 * 60_000);
      await expect(
        service.assertSlotFree(TENANT_ID, [candidate(scheduledAt, endsAt)]),
      ).rejects.toThrow(BookingSlotUnavailableError);
      await expect(
        service.assertSlotFree(TENANT_ID, [candidate(scheduledAt, endsAt)]),
      ).rejects.not.toBeInstanceOf(BookingBundlePartiallyUnavailableError);
    });
  });
});
