import { DataSource } from 'typeorm';
import { createTestDataSource } from '../../../../test/test-datasource';
import { ServiceEntityBuilder } from '../../../../test/builders/booking/index';
import { InMemoryEventBus } from '../../../../test/infrastructure/in-memory-event-bus';
import { RecurringBookingSchedule } from '../../domain/recurring-booking-schedule.aggregate';
import { BookingConcurrentModificationError } from '../../domain/errors/booking-domain.error';
import { ServiceEntity } from '../entities/service.entity';
import { RecurringBookingScheduleEntity } from '../entities/recurring-booking-schedule.entity';
import { RecurringBookingScheduleResourceAssignmentEntity } from '../entities/recurring-booking-schedule-resource-assignment.entity';
import { RecurringBookingScheduleExceptionEntity } from '../entities/recurring-booking-schedule-exception.entity';
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
    endsOn: null,
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

    schedule.pause(CORRELATION_ID);
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

    copyA!.pause(CORRELATION_ID);
    copyB!.pause(CORRELATION_ID);

    await repo.save(copyA!);

    await expect(repo.save(copyB!)).rejects.toBeInstanceOf(BookingConcurrentModificationError);
  });
});
