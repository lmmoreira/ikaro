import { InMemoryBookingRepository } from '../../../../test/repositories/booking/in-memory-booking.repository';
import { BookingBuilder } from '../../../../test/builders/booking/index';
import { BookingStatus } from '../../domain/booking.aggregate';
import { ResourceType } from '../../domain/resource.types';
import { ListBookingsUseCase } from './list-bookings.use-case';

const TENANT_A = '10000000-0000-4000-8000-000000000120';
const TENANT_B = '10000000-0000-4000-8000-000000000121';
const CUSTOMER_ID = '20000000-0000-4000-8000-000000000120';

const SAO_PAULO = 'America/Sao_Paulo';
const AUCKLAND = 'Pacific/Auckland';

const defaultDto = { limit: 25, offset: 0, cancellationWindowHours: 48, timezone: SAO_PAULO };

describe('ListBookingsUseCase', () => {
  let repo: InMemoryBookingRepository;
  let useCase: ListBookingsUseCase;

  beforeEach(() => {
    repo = new InMemoryBookingRepository();
    useCase = new ListBookingsUseCase(repo);
  });

  describe('STAFF/MANAGER role', () => {
    it('returns all tenant bookings when no filters applied', async () => {
      await repo.save(new BookingBuilder().withTenantId(TENANT_A).build());
      await repo.save(new BookingBuilder().withTenantId(TENANT_A).build());

      const result = await useCase.execute({ ...defaultDto, tenantId: TENANT_A });

      expect(result.items).toHaveLength(2);
      expect(result.pagination.total).toBe(2);
      expect(result.pagination.hasMore).toBe(false);
    });

    it('filters by a single status', async () => {
      const approved = new BookingBuilder()
        .withTenantId(TENANT_A)
        .withStatus(BookingStatus.APPROVED)
        .build();
      await repo.save(approved);
      await repo.save(new BookingBuilder().withTenantId(TENANT_A).build());

      const result = await useCase.execute({
        ...defaultDto,
        status: [BookingStatus.APPROVED],
        tenantId: TENANT_A,
      });

      expect(result.items).toHaveLength(1);
      expect(result.items[0].status).toBe('APPROVED');
    });

    it('filters by multiple statuses', async () => {
      await repo.save(
        new BookingBuilder().withTenantId(TENANT_A).withStatus(BookingStatus.PENDING).build(),
      );
      await repo.save(
        new BookingBuilder()
          .withTenantId(TENANT_A)
          .withStatus(BookingStatus.INFO_REQUESTED)
          .build(),
      );
      await repo.save(
        new BookingBuilder().withTenantId(TENANT_A).withStatus(BookingStatus.APPROVED).build(),
      );

      const result = await useCase.execute({
        ...defaultDto,
        status: [BookingStatus.PENDING, BookingStatus.INFO_REQUESTED],
        tenantId: TENANT_A,
      });

      expect(result.items).toHaveLength(2);
      expect(result.items.map((i) => i.status)).toEqual(
        expect.arrayContaining(['PENDING', 'INFO_REQUESTED']),
      );
    });

    it('returns paginated slice with correct hasMore', async () => {
      for (let i = 0; i < 5; i++) {
        await repo.save(new BookingBuilder().withTenantId(TENANT_A).build());
      }

      const result = await useCase.execute({
        ...defaultDto,
        limit: 3,
        offset: 0,
        tenantId: TENANT_A,
      });

      expect(result.items).toHaveLength(3);
      expect(result.pagination.total).toBe(5);
      expect(result.pagination.hasMore).toBe(true);
    });

    it('second page returns remaining items', async () => {
      for (let i = 0; i < 5; i++) {
        await repo.save(new BookingBuilder().withTenantId(TENANT_A).build());
      }

      const result = await useCase.execute({
        ...defaultDto,
        limit: 3,
        offset: 3,
        tenantId: TENANT_A,
      });

      expect(result.items).toHaveLength(2);
      expect(result.pagination.hasMore).toBe(false);
    });

    it('maps booking fields correctly', async () => {
      const booking = new BookingBuilder().withTenantId(TENANT_A).build();
      await repo.save(booking);

      const result = await useCase.execute({ ...defaultDto, tenantId: TENANT_A });

      const item = result.items[0];
      expect(item.id).toBe(booking.id);
      expect(item.status).toBe(booking.status);
      expect(item.type).toBe(booking.type);
      expect(item.totalPrice.amount).toBe(booking.totalPrice.amount.toNumber());
      expect(item.totalPrice.currency).toBe(booking.totalPrice.currency);
      expect(item.lineSummary).toHaveLength(booking.lines.length);
      expect(item.lineSummary[0].lineId).toBe(booking.lines[0].lineId);
      expect(item.lineSummary[0].serviceNameAtBooking).toBeDefined();
      expect(item.lineSummary[0].durationMinsAtBooking).toBe(
        booking.lines[0].durationMinsAtBooking,
      );
    });

    it('sets cancellableUntil to scheduledAt minus the cancellation window on APPROVED bookings', async () => {
      const scheduledAt = new Date('2026-08-10T14:00:00.000Z');
      await repo.save(
        new BookingBuilder()
          .withTenantId(TENANT_A)
          .withStatus(BookingStatus.APPROVED)
          .withScheduledAt(scheduledAt)
          .build(),
      );

      const result = await useCase.execute({
        ...defaultDto,
        cancellationWindowHours: 48,
        tenantId: TENANT_A,
      });

      expect(result.items[0].cancellableUntil).toBe('2026-08-08T14:00:00.000Z');
    });

    it('sets cancellableUntil to null on non-APPROVED bookings', async () => {
      await repo.save(
        new BookingBuilder().withTenantId(TENANT_A).withStatus(BookingStatus.PENDING).build(),
      );

      const result = await useCase.execute({ ...defaultDto, tenantId: TENANT_A });

      expect(result.items[0].cancellableUntil).toBeNull();
    });

    it('does not filter by customerId — sees all bookings', async () => {
      const customerBooking = new BookingBuilder()
        .withTenantId(TENANT_A)
        .withCustomerId(CUSTOMER_ID)
        .build();
      const guestBooking = new BookingBuilder().withTenantId(TENANT_A).build();
      await repo.save(customerBooking);
      await repo.save(guestBooking);

      const result = await useCase.execute({ ...defaultDto, tenantId: TENANT_A });

      expect(result.items).toHaveLength(2);
    });

    it('tenant isolation: only returns bookings for own tenant', async () => {
      await repo.save(new BookingBuilder().withTenantId(TENANT_A).build());
      await repo.save(new BookingBuilder().withTenantId(TENANT_B).build());

      const result = await useCase.execute({ ...defaultDto, tenantId: TENANT_A });

      expect(result.items).toHaveLength(1);
    });

    it('defaults assignedResources to an empty array for a booking with no resource assignments', async () => {
      await repo.save(new BookingBuilder().withTenantId(TENANT_A).build());

      const result = await useCase.execute({ ...defaultDto, tenantId: TENANT_A });

      expect(result.items[0].assignedResources).toEqual([]);
    });

    it('includes every assigned resource for a booking, display-only and unrelated to any client filter (TD44-S2 round 3)', async () => {
      const booking = new BookingBuilder().withTenantId(TENANT_A).build();
      await repo.save(booking);
      repo.setResourceAssignments(booking.id, [
        {
          resourceId: 'res-camila',
          resourceType: ResourceType.STAFF,
          resourceName: 'Camila Duarte',
        },
        { resourceId: 'res-sala-1', resourceType: ResourceType.ROOM, resourceName: 'Sala 1' },
      ]);

      const result = await useCase.execute({ ...defaultDto, tenantId: TENANT_A });

      expect(result.items[0].assignedResources).toEqual([
        {
          resourceId: 'res-camila',
          resourceType: ResourceType.STAFF,
          resourceName: 'Camila Duarte',
        },
        { resourceId: 'res-sala-1', resourceType: ResourceType.ROOM, resourceName: 'Sala 1' },
      ]);
    });
  });

  describe('from/to range', () => {
    // America/Sao_Paulo is UTC-3 year-round, so local Sunday 2026-08-16 runs from
    // 2026-08-16T03:00:00.000Z through 2026-08-17T02:59:59.999Z.
    const SCHEDULED = {
      sundayNoon: '2026-08-16T15:00:00.000Z',
      sundayLastMs: '2026-08-17T02:59:59.999Z',
      sundayNight: '2026-08-17T01:00:00.000Z',
      mondayFirstMs: '2026-08-17T03:00:00.000Z',
    } as const;
    type Slot = keyof typeof SCHEDULED;

    const saveAt = async (scheduledAt: string): Promise<string> => {
      const booking = new BookingBuilder()
        .withTenantId(TENANT_A)
        .withScheduledAt(new Date(scheduledAt))
        .build();
      await repo.save(booking);
      return booking.id;
    };

    let idBySlot: Record<Slot, string>;

    beforeEach(async () => {
      idBySlot = {
        sundayNoon: await saveAt(SCHEDULED.sundayNoon),
        sundayLastMs: await saveAt(SCHEDULED.sundayLastMs),
        sundayNight: await saveAt(SCHEDULED.sundayNight),
        mondayFirstMs: await saveAt(SCHEDULED.mondayFirstMs),
      };
    });

    const listIds = async (range: { from?: string; to?: string }, timezone = SAO_PAULO) => {
      const result = await useCase.execute({
        ...defaultDto,
        ...range,
        timezone,
        tenantId: TENANT_A,
      });
      return result.items.map((i) => i.id).sort((a, b) => a.localeCompare(b));
    };
    const idsOf = (...slots: Slot[]) =>
      slots.map((s) => idBySlot[s]).sort((a, b) => a.localeCompare(b));

    it.each<[string, { from?: string; to?: string }, Slot[]]>([
      [
        'a date-key week includes the evening bookings on its last local day',
        { from: '2026-08-10', to: '2026-08-16' },
        ['sundayNoon', 'sundayNight', 'sundayLastMs'],
      ],
      [
        'the next date-key week starts at the local midnight, not the UTC one',
        { from: '2026-08-17', to: '2026-08-23' },
        ['mondayFirstMs'],
      ],
      [
        'instants are passed through unchanged and never shifted by the timezone',
        { from: '2026-08-10T00:00:00.000Z', to: '2026-08-16T23:59:59.999Z' },
        ['sundayNoon'],
      ],
      [
        'a date-key from with an instant to converts only the date-key side',
        { from: '2026-08-16', to: '2026-08-17T01:00:00.000Z' },
        ['sundayNoon', 'sundayNight'],
      ],
      [
        'an instant from with a date-key to converts only the date-key side',
        { from: '2026-08-16T15:00:00.000Z', to: '2026-08-16' },
        ['sundayNoon', 'sundayNight', 'sundayLastMs'],
      ],
      [
        'a date-key from alone is open-ended from the local start of that day',
        { from: '2026-08-17' },
        ['mondayFirstMs'],
      ],
      [
        'a date-key to alone is bounded by the local end of that day',
        { to: '2026-08-16' },
        ['sundayNoon', 'sundayNight', 'sundayLastMs'],
      ],
      [
        'a from later than to is not validated and matches nothing',
        { from: '2026-08-20', to: '2026-08-10' },
        [],
      ],
    ])('%s', async (_name, range, expectedSlots) => {
      expect(await listIds(range)).toEqual(idsOf(...expectedSlots));
    });

    it('converts a date key with the timezone it is given, for a UTC+ zone', async () => {
      // 2026-08-16T00:00 in Pacific/Auckland (UTC+12 in August) is 2026-08-15T12:00:00.000Z.
      const aucklandBookingId = await saveAt('2026-08-15T12:30:00.000Z');
      const range = { from: '2026-08-16', to: '2026-08-16' };

      expect(await listIds(range, AUCKLAND)).toContain(aucklandBookingId);
      expect(await listIds(range, SAO_PAULO)).not.toContain(aucklandBookingId);
    });
  });

  describe('recurringScheduleId filter (M23-S08)', () => {
    const SCHEDULE_ID = '30000000-0000-4000-8000-000000000120';

    it("returns only that schedule's occurrence bookings", async () => {
      const occurrence = new BookingBuilder()
        .withTenantId(TENANT_A)
        .withRecurringScheduleId(SCHEDULE_ID)
        .build();
      await repo.save(occurrence);
      await repo.save(
        new BookingBuilder()
          .withTenantId(TENANT_A)
          .withRecurringScheduleId('30000000-0000-4000-8000-000000000999')
          .build(),
      );
      await repo.save(new BookingBuilder().withTenantId(TENANT_A).build());

      const result = await useCase.execute({
        ...defaultDto,
        tenantId: TENANT_A,
        recurringScheduleId: SCHEDULE_ID,
      });

      expect(result.items.map((i) => i.id)).toEqual([occurrence.id]);
    });

    it('stays scoped to the tenant', async () => {
      await repo.save(
        new BookingBuilder().withTenantId(TENANT_A).withRecurringScheduleId(SCHEDULE_ID).build(),
      );

      const result = await useCase.execute({
        ...defaultDto,
        tenantId: TENANT_B,
        recurringScheduleId: SCHEDULE_ID,
      });

      expect(result.items).toHaveLength(0);
    });

    it("combines with the customer scope so a customer only lists their own schedule's bookings", async () => {
      const own = new BookingBuilder()
        .withTenantId(TENANT_A)
        .withCustomerId(CUSTOMER_ID)
        .withRecurringScheduleId(SCHEDULE_ID)
        .build();
      await repo.save(own);
      await repo.save(
        new BookingBuilder()
          .withTenantId(TENANT_A)
          .withCustomerId('20000000-0000-4000-8000-000000000999')
          .withRecurringScheduleId(SCHEDULE_ID)
          .build(),
      );

      const result = await useCase.execute({
        ...defaultDto,
        tenantId: TENANT_A,
        customerId: CUSTOMER_ID,
        recurringScheduleId: SCHEDULE_ID,
      });

      expect(result.items.map((i) => i.id)).toEqual([own.id]);
    });
  });

  describe('CUSTOMER role', () => {
    it('returns only own bookings when customerId is passed', async () => {
      const ownBooking = new BookingBuilder()
        .withTenantId(TENANT_A)
        .withCustomerId(CUSTOMER_ID)
        .build();
      const otherBooking = new BookingBuilder()
        .withTenantId(TENANT_A)
        .withCustomerId('20000000-0000-4000-8000-000000000999')
        .build();
      await repo.save(ownBooking);
      await repo.save(otherBooking);

      const result = await useCase.execute({
        ...defaultDto,
        tenantId: TENANT_A,
        customerId: CUSTOMER_ID,
      });

      expect(result.items).toHaveLength(1);
      expect(result.items[0].id).toBe(ownBooking.id);
    });

    it('returns empty list when customer has no bookings', async () => {
      const result = await useCase.execute({
        ...defaultDto,
        tenantId: TENANT_A,
        customerId: CUSTOMER_ID,
      });
      expect(result.items).toHaveLength(0);
      expect(result.pagination.total).toBe(0);
    });
  });
});
