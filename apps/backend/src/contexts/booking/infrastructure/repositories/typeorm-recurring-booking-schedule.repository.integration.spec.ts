import { DataSource } from 'typeorm';
import { createTestDataSource } from '../../../../test/test-datasource';
import {
  RecurringBookingScheduleEntityBuilder,
  ServiceEntityBuilder,
} from '../../../../test/builders/booking/index';
import { InMemoryEventBus } from '../../../../test/infrastructure/in-memory-event-bus';
import { RecurringBookingSchedule } from '../../domain/recurring-booking-schedule.aggregate';
import { BookingConcurrentModificationError } from '../../domain/errors/booking-domain.error';
import { ServiceEntity } from '../entities/service.entity';
import { RecurringBookingScheduleEntity } from '../entities/recurring-booking-schedule.entity';
import { RecurringBookingScheduleResourceAssignmentEntity } from '../entities/recurring-booking-schedule-resource-assignment.entity';
import { RecurringBookingScheduleExceptionEntity } from '../entities/recurring-booking-schedule-exception.entity';
import { uuidv7 } from '../../../../shared/domain/uuid-v7';
import { TypeOrmRecurringBookingScheduleRepository } from './typeorm-recurring-booking-schedule.repository';

const TENANT_ID = '00000000-0000-7000-8000-000000000090';
const SERVICE_ID = '00000000-0000-7000-8000-000000000091';
const CUSTOMER_ID = '00000000-0000-7000-8000-000000000093';
const CORRELATION_ID = 'corr-repo-integration';

function activeSchedule(): RecurringBookingSchedule {
  return RecurringBookingSchedule.request({
    tenantId: TENANT_ID,
    customerId: CUSTOMER_ID,
    serviceId: SERVICE_ID,
    recurrence: {
      frequency: 'WEEKLY',
      daysOfWeek: ['tuesday'],
      startTime: '10:00',
      durationMinutes: 60,
    },
    startsOn: '2026-09-01',
    endsOn: '2026-11-24',
    maxTermDays: 90,
    assignmentPolicy: 'RESOLVE_PER_OCCURRENCE',
    resourceAssignments: [],
    status: 'ACTIVE',
    approvalHoldExpiresAt: null,
    createdByStaffId: null,
    correlationId: CORRELATION_ID,
  });
}

describe('TypeOrmRecurringBookingScheduleRepository (integration)', () => {
  let dataSource: DataSource;
  let repo: TypeOrmRecurringBookingScheduleRepository;

  beforeAll(async () => {
    dataSource = await createTestDataSource();
    repo = new TypeOrmRecurringBookingScheduleRepository(
      dataSource.getRepository(RecurringBookingScheduleEntity),
      dataSource.getRepository(RecurringBookingScheduleResourceAssignmentEntity),
      dataSource.getRepository(RecurringBookingScheduleExceptionEntity),
      new InMemoryEventBus(),
    );

    await dataSource
      .getRepository(ServiceEntity)
      .save(new ServiceEntityBuilder().withId(SERVICE_ID).withTenantId(TENANT_ID).build());
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  it('assigns version 1 on insert and increments it on every subsequent save', async () => {
    const schedule = activeSchedule();
    expect(schedule.version).toBeUndefined();

    await repo.save(schedule);
    expect(schedule.version).toBe(1);

    schedule.end(CORRELATION_ID, []);
    await repo.save(schedule);
    expect(schedule.version).toBe(2);

    const reloaded = await repo.findById(schedule.id, TENANT_ID);
    expect(reloaded?.version).toBe(2);
  });

  it('throws BookingConcurrentModificationError when saving a stale loaded aggregate', async () => {
    const schedule = activeSchedule();
    await repo.save(schedule);

    const copyA = await repo.findById(schedule.id, TENANT_ID);
    const copyB = await repo.findById(schedule.id, TENANT_ID);
    expect(copyA).not.toBeNull();
    expect(copyB).not.toBeNull();

    copyA!.end(CORRELATION_ID, []);
    copyB!.end(CORRELATION_ID, []);

    await repo.save(copyA!);

    await expect(repo.save(copyB!)).rejects.toBeInstanceOf(BookingConcurrentModificationError);
  });

  describe('findAllByTenantPaginated', () => {
    // Each test owns its tenant, so `total` is exact regardless of what other tests saved.
    async function seedTenant(
      count: number,
      opts: { customerId?: string; status?: 'ACTIVE' | 'PENDING_APPROVAL' } = {},
    ): Promise<{ tenantId: string; ids: string[] }> {
      const tenantId = uuidv7();
      const serviceId = uuidv7();
      await dataSource
        .getRepository(ServiceEntity)
        .save(new ServiceEntityBuilder().withId(serviceId).withTenantId(tenantId).build());
      const entities = Array.from({ length: count }, () => {
        const builder = new RecurringBookingScheduleEntityBuilder()
          .withTenantId(tenantId)
          .withServiceId(serviceId)
          .withCustomerId(opts.customerId ?? CUSTOMER_ID)
          .withStatus(opts.status ?? 'ACTIVE');
        return opts.status === 'PENDING_APPROVAL'
          ? builder.withApprovalHoldExpiresAt(new Date('2099-01-01T00:00:00Z')).build()
          : builder.build();
      });
      await dataSource.getRepository(RecurringBookingScheduleEntity).save(entities);
      return { tenantId, ids: entities.map((e) => e.id) };
    }

    it('returns exactly one page of N when N+1 rows exist, then the remainder, with the full total', async () => {
      const { tenantId } = await seedTenant(3);

      const first = await repo.findAllByTenantPaginated(tenantId, { limit: 2, offset: 0 });
      const second = await repo.findAllByTenantPaginated(tenantId, { limit: 2, offset: 2 });

      expect(first.items).toHaveLength(2);
      expect(first.total).toBe(3);
      expect(second.items).toHaveLength(1);
      expect(second.total).toBe(3);
      const ids = [...first.items, ...second.items].map((i) => i.id);
      expect(new Set(ids).size).toBe(3);
    });

    it('never skips or duplicates rows that share one createdAt across a page boundary', async () => {
      const { tenantId, ids } = await seedTenant(5);
      // Raw SQL: TypeORM's update() skips a @CreateDateColumn, so it cannot pin created_at.
      await dataSource.query(
        `UPDATE booking.recurring_booking_schedules SET created_at = $1 WHERE tenant_id = $2`,
        [new Date('2026-01-01T00:00:00Z'), tenantId],
      );

      const seen: string[] = [];
      for (let offset = 0; offset < 5; offset += 2) {
        const page = await repo.findAllByTenantPaginated(tenantId, { limit: 2, offset });
        seen.push(...page.items.map((i) => i.id));
      }

      expect([...seen].sort()).toEqual([...ids].sort());
      expect(seen).toEqual([...seen].sort().reverse());
    });

    it('orders newest first', async () => {
      const { tenantId, ids } = await seedTenant(2);
      const pinCreatedAt = (id: string, createdAt: Date) =>
        dataSource.query(
          `UPDATE booking.recurring_booking_schedules SET created_at = $1 WHERE tenant_id = $2 AND id = $3`,
          [createdAt, tenantId, id],
        );
      await pinCreatedAt(ids[0], new Date('2026-01-01T00:00:00Z'));
      await pinCreatedAt(ids[1], new Date('2026-02-01T00:00:00Z'));

      const { items } = await repo.findAllByTenantPaginated(tenantId, { limit: 10, offset: 0 });

      expect(items.map((i) => i.id)).toEqual([ids[1], ids[0]]);
    });

    it('filters by status and counts only matching rows in total', async () => {
      const { tenantId } = await seedTenant(2, { status: 'PENDING_APPROVAL' });
      const serviceRows = await dataSource
        .getRepository(RecurringBookingScheduleEntity)
        .find({ where: { tenantId } });
      await dataSource
        .getRepository(RecurringBookingScheduleEntity)
        .save(
          new RecurringBookingScheduleEntityBuilder()
            .withTenantId(tenantId)
            .withServiceId(serviceRows[0].serviceId)
            .withCustomerId(CUSTOMER_ID)
            .withStatus('ACTIVE')
            .build(),
        );

      const pending = await repo.findAllByTenantPaginated(tenantId, {
        status: 'PENDING_APPROVAL',
        limit: 10,
        offset: 0,
      });
      const all = await repo.findAllByTenantPaginated(tenantId, { limit: 10, offset: 0 });

      expect(pending.total).toBe(2);
      expect(pending.items.every((i) => i.status === 'PENDING_APPROVAL')).toBe(true);
      expect(all.total).toBe(3);
    });

    it("scopes to one customer's rows when customerId is set", async () => {
      const { tenantId } = await seedTenant(2, { customerId: CUSTOMER_ID });

      const mine = await repo.findAllByTenantPaginated(tenantId, {
        customerId: CUSTOMER_ID,
        limit: 10,
        offset: 0,
      });
      const someoneElse = await repo.findAllByTenantPaginated(tenantId, {
        customerId: uuidv7(),
        limit: 10,
        offset: 0,
      });

      expect(mine.total).toBe(2);
      expect(someoneElse.total).toBe(0);
    });

    it("never leaks another tenant's rows into a page or its total", async () => {
      const a = await seedTenant(2);
      await seedTenant(3);

      const page = await repo.findAllByTenantPaginated(a.tenantId, { limit: 10, offset: 0 });

      expect(page.total).toBe(2);
      expect(page.items.map((i) => i.id).sort()).toEqual([...a.ids].sort());
    });
  });
});
