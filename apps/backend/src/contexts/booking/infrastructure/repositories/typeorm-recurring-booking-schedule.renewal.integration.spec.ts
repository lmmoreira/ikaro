import { DataSource } from 'typeorm';
import { uuidv7 } from '../../../../shared/domain/uuid-v7';
import {
  RecurringBookingScheduleBuilder,
  ServiceEntityBuilder,
} from '../../../../test/builders/booking/index';
import { InMemoryEventBus } from '../../../../test/infrastructure/in-memory-event-bus';
import { createTestDataSource } from '../../../../test/test-datasource';
import { RecurringBookingScheduleEntity } from '../entities/recurring-booking-schedule.entity';
import { RecurringBookingScheduleResourceAssignmentEntity } from '../entities/recurring-booking-schedule-resource-assignment.entity';
import { ServiceEntity } from '../entities/service.entity';
import { TypeOrmRecurringBookingScheduleRepository } from './typeorm-recurring-booking-schedule.repository';

// M23-S21: the two reads the renewal reminder and the schedule list's `renewable` flag sit on,
// against real Postgres. Every id is generated per run, so a reused container never sees a
// leftover row from another spec.
describe('TypeOrmRecurringBookingScheduleRepository — renewal reads (integration)', () => {
  let dataSource: DataSource;
  let repo: TypeOrmRecurringBookingScheduleRepository;
  const tenantA = uuidv7();
  const tenantB = uuidv7();
  const serviceA = uuidv7();
  const otherServiceA = uuidv7();
  const serviceB = uuidv7();

  beforeAll(async () => {
    dataSource = await createTestDataSource();
    repo = new TypeOrmRecurringBookingScheduleRepository(
      dataSource.getRepository(RecurringBookingScheduleEntity),
      dataSource.getRepository(RecurringBookingScheduleResourceAssignmentEntity),
      new InMemoryEventBus(),
    );
    await dataSource
      .getRepository(ServiceEntity)
      .save([
        new ServiceEntityBuilder().withId(serviceA).withTenantId(tenantA).build(),
        new ServiceEntityBuilder().withId(otherServiceA).withTenantId(tenantA).build(),
        new ServiceEntityBuilder().withId(serviceB).withTenantId(tenantB).build(),
      ]);
  });

  afterAll(async () => {
    await dataSource
      .getRepository(RecurringBookingScheduleEntity)
      .delete([{ tenantId: tenantA }, { tenantId: tenantB }]);
    await dataSource
      .getRepository(ServiceEntity)
      .delete([{ tenantId: tenantA }, { tenantId: tenantB }]);
    await dataSource.destroy();
  });

  const build = (
    tenantId: string,
    customerId: string,
    serviceId: string,
    startsOn: string,
    endsOn: string,
    status: 'ACTIVE' | 'ENDED' | 'PENDING_APPROVAL' = 'ACTIVE',
  ) =>
    new RecurringBookingScheduleBuilder()
      .withTenantId(tenantId)
      .withCustomerId(customerId)
      .withServiceId(serviceId)
      .withTerm(startsOn, endsOn)
      .withStatus(status)
      .build();

  describe('findActiveEndingOn()', () => {
    it('returns only ACTIVE schedules ending exactly on the date, for the tenant asked', async () => {
      const customer = uuidv7();
      const exact = build(tenantA, customer, serviceA, '2026-08-01', '2026-10-19');
      const dayBefore = build(tenantA, customer, serviceA, '2026-08-01', '2026-10-18');
      const dayAfter = build(tenantA, customer, serviceA, '2026-08-01', '2026-10-20');
      const ended = build(tenantA, customer, serviceA, '2026-08-01', '2026-10-19', 'ENDED');
      const pending = build(
        tenantA,
        customer,
        serviceA,
        '2026-08-01',
        '2026-10-19',
        'PENDING_APPROVAL',
      );
      const otherTenant = build(tenantB, customer, serviceB, '2026-08-01', '2026-10-19');
      for (const s of [exact, dayBefore, dayAfter, ended, pending, otherTenant]) await repo.save(s);

      const found = await repo.findActiveEndingOn(tenantA, '2026-10-19');

      expect(found.map((s) => s.id)).toEqual([exact.id]);
    });
  });

  describe('findSuccessorScheduleIds()', () => {
    it('finds a successor of the same customer and service starting on or after the end', async () => {
      const customer = uuidv7();
      const ending = build(tenantA, customer, serviceA, '2026-08-01', '2026-10-19');
      const successor = build(tenantA, customer, serviceA, '2026-10-19', '2027-01-15');
      for (const s of [ending, successor]) await repo.save(s);

      const withSuccessor = await repo.findSuccessorScheduleIds(tenantA, [ending]);

      expect(withSuccessor).toEqual(new Set([ending.id]));
    });

    it('counts a PENDING_APPROVAL successor and answers per schedule in one call', async () => {
      const customer = uuidv7();
      const withPending = build(tenantA, customer, serviceA, '2026-08-01', '2026-10-19');
      const pending = build(
        tenantA,
        customer,
        serviceA,
        '2026-10-20',
        '2027-01-15',
        'PENDING_APPROVAL',
      );
      const lonely = build(tenantA, uuidv7(), serviceA, '2026-08-01', '2026-10-19');
      for (const s of [withPending, pending, lonely]) await repo.save(s);

      const withSuccessor = await repo.findSuccessorScheduleIds(tenantA, [withPending, lonely]);

      expect(withSuccessor).toEqual(new Set([withPending.id]));
    });

    it.each([
      ['another customer', () => build(tenantA, uuidv7(), serviceA, '2026-10-19', '2027-01-15')],
      [
        'another service',
        (c: string) => build(tenantA, c, otherServiceA, '2026-10-19', '2027-01-15'),
      ],
      [
        'a schedule starting before this one ends',
        (c: string) => build(tenantA, c, serviceA, '2026-10-18', '2027-01-15'),
      ],
      [
        'an ENDED schedule',
        (c: string) => build(tenantA, c, serviceA, '2026-10-19', '2027-01-15', 'ENDED'),
      ],
    ])('does not find a successor in %s', async (_label, makeOther) => {
      const customer = uuidv7();
      const ending = build(tenantA, customer, serviceA, '2026-08-01', '2026-10-19');
      for (const s of [ending, makeOther(customer)]) await repo.save(s);

      expect(await repo.findSuccessorScheduleIds(tenantA, [ending])).toEqual(new Set());
    });

    it("never counts another tenant's schedule of the same customer id (tenant isolation)", async () => {
      const customer = uuidv7();
      const ending = build(tenantA, customer, serviceA, '2026-08-01', '2026-10-19');
      const foreign = build(tenantB, customer, serviceB, '2026-10-19', '2027-01-15');
      for (const s of [ending, foreign]) await repo.save(s);

      expect(await repo.findSuccessorScheduleIds(tenantA, [ending])).toEqual(new Set());
    });

    it('answers an empty set without a query for an empty batch', async () => {
      expect(await repo.findSuccessorScheduleIds(tenantA, [])).toEqual(new Set());
    });
  });
});
