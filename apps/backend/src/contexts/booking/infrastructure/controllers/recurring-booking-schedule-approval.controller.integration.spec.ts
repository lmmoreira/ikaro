import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';

import {
  BookingEntityBuilder,
  ResourceEntityBuilder,
  ScheduleClosureEntityBuilder,
  ServiceEntityBuilder,
  ServiceResourceRequirementEntityBuilder,
  ServiceResourceRequirementPoolEntityBuilder,
} from '../../../../test/builders/booking/index';
import { CustomerEntityBuilder } from '../../../../test/builders/customer/index';
import { actorHeaders } from '../../../../test/utils/actor-headers';
import { addDays, nextWeekday } from '../../../../test/utils/date-helpers';
import { createBookingIntegrationApp } from '../../../../test/utils/booking-integration-app';
import { ExpireRecurringBookingScheduleApprovalsJob } from '../../application/jobs/expire-recurring-schedule-approvals.job';
import { PlatformModule } from '../../../platform/platform.module';
import { CustomerEntity } from '../../../customer/infrastructure/entities/customer.entity';
import { BookingEntity } from '../entities/booking.entity';
import { BookingLineEntity } from '../entities/booking-line.entity';
import { BookingLineResourceAssignmentEntity } from '../entities/booking-line-resource-assignment.entity';
import { RecurringBookingScheduleEntity } from '../entities/recurring-booking-schedule.entity';
import { RecurringBookingScheduleResourceAssignmentEntity } from '../entities/recurring-booking-schedule-resource-assignment.entity';
import { ResourceEntity } from '../entities/resource.entity';
import { ResourceOccupancyEntity } from '../entities/resource-occupancy.entity';
import { ScheduleClosureEntity } from '../entities/schedule-closure.entity';
import { ServiceEntity } from '../entities/service.entity';
import {
  ServiceResourceRequirementEntity,
  ServiceResourceRequirementPoolEntity,
} from '../entities/service-resource-requirement.entity';
import { ResourceType } from '../../domain/resource.types';

const TEST_KEY = 'recur-approval-integ-key-xxxxxx'; // 32 chars
const CUSTOMER_ID = '20000000-0000-4000-8000-000000000701';
const NO_PHONE_CUSTOMER_ID = '20000000-0000-4000-8000-000000000702';
const STAFF_ID = '30000000-0000-4000-8000-000000000701';

// Every schedule recurs on Tuesdays, four weeks: five occurrences, both ends included.
const STARTS_ON = nextWeekday(2);
const ENDS_ON = addDays(STARTS_ON, 28);

describe('Recurring schedule approval, materialization and expiry (integration)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let tenantId: string;
  let otherTenantId: string;
  let expireJob: ExpireRecurringBookingScheduleApprovalsJob;

  async function createTenant(slug: string): Promise<string> {
    const { body } = await request(app.getHttpServer())
      .post('/internal/tenants')
      .set('X-Platform-Admin-Key', TEST_KEY)
      .send({ name: slug, slug, adminEmail: `a@${slug}.test`, country_code: 'BR' })
      .expect(201);
    return body.tenantId as string;
  }

  beforeAll(async () => {
    process.env['PLATFORM_ADMIN_KEY'] = TEST_KEY;
    ({ app, ds } = await createBookingIntegrationApp({ extraModules: [PlatformModule] }));
    tenantId = await createTenant('recurring-approval-a');
    otherTenantId = await createTenant('recurring-approval-b');
    expireJob = app.get(ExpireRecurringBookingScheduleApprovalsJob);

    await ds
      .getRepository(CustomerEntity)
      .save([
        new CustomerEntityBuilder()
          .withTenantId(tenantId)
          .withId(CUSTOMER_ID)
          .withGoogleOAuthId('google-approval-ana')
          .withEmail('ana@approval.test')
          .withName('Ana Souza')
          .withPhone('+5531999999999')
          .build(),
        new CustomerEntityBuilder()
          .withTenantId(tenantId)
          .withId(NO_PHONE_CUSTOMER_ID)
          .withGoogleOAuthId('google-approval-nophone')
          .withEmail('nophone@approval.test')
          .withName('Sem Telefone')
          .withPhone(null)
          .build(),
      ]);
  });

  afterAll(async () => {
    for (const id of [tenantId, otherTenantId]) {
      await ds
        .getRepository(RecurringBookingScheduleResourceAssignmentEntity)
        .delete({ tenantId: id });
      await ds.getRepository(ResourceOccupancyEntity).delete({ tenantId: id });
      await ds.getRepository(BookingLineResourceAssignmentEntity).delete({ tenantId: id });
      await ds.getRepository(BookingLineEntity).delete({ tenantId: id });
      await ds.getRepository(BookingEntity).delete({ tenantId: id });
      await ds.getRepository(RecurringBookingScheduleEntity).delete({ tenantId: id });
      await ds.getRepository(ScheduleClosureEntity).delete({ tenantId: id });
      await ds.getRepository(ServiceResourceRequirementPoolEntity).delete({ tenantId: id });
      await ds.getRepository(ServiceResourceRequirementEntity).delete({ tenantId: id });
      await ds.getRepository(ResourceEntity).delete({ tenantId: id });
      await ds.getRepository(ServiceEntity).delete({ tenantId: id });
      await ds.getRepository(CustomerEntity).delete({ tenantId: id });
    }
    await app.close();
  });

  // A fresh resource and service per test, so no test's occupancy can collide with another's.
  async function seedFixture(mode: 'AUTO_CONFIRM' | 'MANUAL_APPROVAL') {
    const resource = await ds
      .getRepository(ResourceEntity)
      .save(
        new ResourceEntityBuilder()
          .withTenantId(tenantId)
          .withType(ResourceType.ROOM)
          .withName('Sala')
          .build(),
      );
    const service = await ds
      .getRepository(ServiceEntity)
      .save(
        new ServiceEntityBuilder()
          .withTenantId(tenantId)
          .withName('Sala — reserva')
          .withRecurrenceEligible(true)
          .withDefaultApprovalMode(mode)
          .withBufferAfterMinutes(0)
          .build(),
      );
    await ds
      .getRepository(ServiceResourceRequirementEntity)
      .save(
        new ServiceResourceRequirementEntityBuilder()
          .withTenantId(tenantId)
          .withServiceId(service.id)
          .withResourceType(ResourceType.ROOM)
          .withSelectionMode('CUSTOMER_CHOICE')
          .build(),
      );
    return { resourceId: resource.id, serviceId: service.id };
  }

  function requestSchedule(
    fixture: { resourceId: string; serviceId: string },
    overrides: { customerId?: string; startTime?: string; durationMinutes?: number } = {},
  ) {
    return request(app.getHttpServer())
      .post('/recurring-booking-schedules')
      .set(actorHeaders(tenantId, overrides.customerId ?? CUSTOMER_ID, 'CUSTOMER'))
      .send({
        serviceId: fixture.serviceId,
        recurrence: {
          frequency: 'WEEKLY',
          daysOfWeek: ['tuesday'],
          startTime: overrides.startTime ?? '10:00',
          durationMinutes: overrides.durationMinutes ?? 60,
        },
        assignmentPolicy: 'FIXED_ASSIGNMENT',
        resourceIds: [fixture.resourceId],
        startsOn: STARTS_ON,
        endsOn: ENDS_ON,
      });
  }

  const decide = (scheduleId: string, action: 'approve' | 'reject', forTenant = tenantId) =>
    request(app.getHttpServer())
      .post(`/recurring-booking-schedules/${scheduleId}/${action}`)
      .set(actorHeaders(forTenant, STAFF_ID, 'STAFF'));

  const bookingsOf = (scheduleId: string) =>
    ds.getRepository(BookingEntity).find({ where: { tenantId, recurringScheduleId: scheduleId } });

  const scheduleRow = (scheduleId: string) =>
    ds.getRepository(RecurringBookingScheduleEntity).findOneByOrFail({ id: scheduleId, tenantId });

  describe('approve', () => {
    it('turns a PENDING_APPROVAL request into real APPROVED bookings for every occurrence', async () => {
      const fixture = await seedFixture('MANUAL_APPROVAL');
      const { body: pending } = await requestSchedule(fixture).expect(201);
      expect(await bookingsOf(pending.id)).toHaveLength(0);

      const { body } = await decide(pending.id, 'approve').expect(200);

      expect(body).toEqual({ id: pending.id, status: 'ACTIVE', occurrenceCount: 5 });
      const row = await scheduleRow(pending.id);
      expect(row.status).toBe('ACTIVE');
      expect(row.approvedByStaffId).toBe(STAFF_ID);
      expect(row.approvalHoldExpiresAt).toBeNull();
      const bookings = await bookingsOf(pending.id);
      expect(bookings).toHaveLength(5);
      expect(bookings.every((b) => b.status === 'APPROVED' && b.approvedBy === STAFF_ID)).toBe(
        true,
      );
      expect(bookings.every((b) => b.customerId === CUSTOMER_ID)).toBe(true);
      const occupancy = await ds
        .getRepository(ResourceOccupancyEntity)
        .find({ where: { tenantId, resourceId: fixture.resourceId } });
      expect(occupancy).toHaveLength(5);
      expect(occupancy.every((o) => o.lockState === 'COMMITTED')).toBe(true);
    });

    it('refuses the whole approval when a closure appeared while it waited, creating nothing', async () => {
      const fixture = await seedFixture('MANUAL_APPROVAL');
      const { body: pending } = await requestSchedule(fixture).expect(201);
      const closedDate = addDays(STARTS_ON, 14);
      await ds
        .getRepository(ScheduleClosureEntity)
        .save(
          new ScheduleClosureEntityBuilder().withTenantId(tenantId).withDate(closedDate).build(),
        );

      const res = await decide(pending.id, 'approve').expect(409);

      expect(res.body.code).toBe('BOOKING_RECURRING_SCHEDULE_CONFLICT');
      expect(res.body.conflicts).toHaveLength(1);
      expect(res.body.conflicts[0].reason).toBe('CLOSED');
      expect(await bookingsOf(pending.id)).toHaveLength(0);
      const row = await scheduleRow(pending.id);
      expect(row.status).toBe('PENDING_APPROVAL');
      expect(row.approvalHoldExpiresAt).not.toBeNull();
      expect(row.approvedByStaffId).toBeNull();
      await ds.getRepository(ScheduleClosureEntity).delete({ tenantId, date: closedDate });
    });

    it('answers 409 NOT_PENDING_APPROVAL when the request was already resolved', async () => {
      const fixture = await seedFixture('MANUAL_APPROVAL');
      const { body: pending } = await requestSchedule(fixture).expect(201);
      await decide(pending.id, 'approve').expect(200);

      const res = await decide(pending.id, 'approve').expect(409);

      expect(res.body.code).toBe('BOOKING_RECURRING_SCHEDULE_NOT_PENDING_APPROVAL');
      expect(await bookingsOf(pending.id)).toHaveLength(5);
    });

    it('answers 409 when the hold deadline has passed but the expiry job has not run yet', async () => {
      const fixture = await seedFixture('MANUAL_APPROVAL');
      const { body: pending } = await requestSchedule(fixture).expect(201);
      await ds
        .getRepository(RecurringBookingScheduleEntity)
        .update(
          { id: pending.id, tenantId },
          { approvalHoldExpiresAt: new Date(Date.now() - 1000) },
        );

      const res = await decide(pending.id, 'approve').expect(409);

      expect(res.body.code).toBe('BOOKING_RECURRING_SCHEDULE_NOT_PENDING_APPROVAL');
      expect(await bookingsOf(pending.id)).toHaveLength(0);
    });

    it("never reaches another tenant's schedule", async () => {
      const fixture = await seedFixture('MANUAL_APPROVAL');
      const { body: pending } = await requestSchedule(fixture).expect(201);

      await decide(pending.id, 'approve', otherTenantId).expect(404);
      await decide(pending.id, 'reject', otherTenantId).expect(404);

      expect((await scheduleRow(pending.id)).status).toBe('PENDING_APPROVAL');
      expect(await bookingsOf(pending.id)).toHaveLength(0);
    });

    it('is forbidden to a customer', async () => {
      const fixture = await seedFixture('MANUAL_APPROVAL');
      const { body: pending } = await requestSchedule(fixture).expect(201);

      const res = await request(app.getHttpServer())
        .post(`/recurring-booking-schedules/${pending.id}/approve`)
        .set(actorHeaders(tenantId, CUSTOMER_ID, 'CUSTOMER'));

      expect(res.status).toBe(403);
      expect((await scheduleRow(pending.id)).status).toBe('PENDING_APPROVAL');
    });
  });

  describe('reject', () => {
    it('cancels the request with APPROVAL_REJECTED and never creates an occurrence', async () => {
      const fixture = await seedFixture('MANUAL_APPROVAL');
      const { body: pending } = await requestSchedule(fixture).expect(201);

      const { body } = await decide(pending.id, 'reject').expect(200);

      expect(body).toEqual({ id: pending.id, status: 'CANCELLED' });
      const row = await scheduleRow(pending.id);
      expect(row.status).toBe('CANCELLED');
      expect(row.cancellationReason).toBe('APPROVAL_REJECTED');
      expect(row.approvalHoldExpiresAt).toBeNull();
      expect(await bookingsOf(pending.id)).toHaveLength(0);
    });

    it('answers 409 for an already-resolved request', async () => {
      const fixture = await seedFixture('MANUAL_APPROVAL');
      const { body: pending } = await requestSchedule(fixture).expect(201);
      await decide(pending.id, 'reject').expect(200);

      const res = await decide(pending.id, 'reject');

      expect(res.status).toBe(409);
      expect(res.body.code).toBe('BOOKING_RECURRING_SCHEDULE_NOT_PENDING_APPROVAL');
    });
  });

  describe('AUTO_CONFIRM materialization', () => {
    it('materializes the whole term in the creation transaction with COMMITTED occupancy', async () => {
      const fixture = await seedFixture('AUTO_CONFIRM');

      const { body } = await requestSchedule(fixture).expect(201);

      const bookings = await bookingsOf(body.id);
      expect(bookings).toHaveLength(5);
      expect(bookings.every((b) => b.approvedBy === null && b.status === 'APPROVED')).toBe(true);
      const occupancy = await ds
        .getRepository(ResourceOccupancyEntity)
        .count({ where: { tenantId, resourceId: fixture.resourceId, lockState: 'COMMITTED' } });
      expect(occupancy).toBe(5);
    });

    it('creates nothing, the schedule included, when materialization fails', async () => {
      const fixture = await seedFixture('AUTO_CONFIRM');

      await requestSchedule(fixture, { customerId: NO_PHONE_CUSTOMER_ID }).expect(422);

      const schedules = await ds
        .getRepository(RecurringBookingScheduleEntity)
        .count({ where: { tenantId, customerId: NO_PHONE_CUSTOMER_ID } });
      expect(schedules).toBe(0);
      const occupancy = await ds
        .getRepository(ResourceOccupancyEntity)
        .count({ where: { tenantId, resourceId: fixture.resourceId } });
      expect(occupancy).toBe(0);
    });

    it('refuses a second pattern that collides with the first, listing the occupied dates', async () => {
      const fixture = await seedFixture('AUTO_CONFIRM');
      await requestSchedule(fixture, { startTime: '10:00', durationMinutes: 120 }).expect(201);

      const res = await requestSchedule(fixture, {
        startTime: '10:30',
        durationMinutes: 60,
      }).expect(409);

      expect(res.body.code).toBe('BOOKING_RECURRING_SCHEDULE_CONFLICT');
      expect(res.body.conflicts).toHaveLength(5);
      expect(res.body.conflicts.every((c: { reason: string }) => c.reason === 'OCCUPIED')).toBe(
        true,
      );
    });

    it('lets two patterns share a resource at non-overlapping times', async () => {
      const fixture = await seedFixture('AUTO_CONFIRM');
      await requestSchedule(fixture, { startTime: '09:00', durationMinutes: 60 }).expect(201);

      const second = await requestSchedule(fixture, { startTime: '11:00', durationMinutes: 60 });

      expect(second.status).toBe(201);
      expect(await bookingsOf(second.body.id)).toHaveLength(5);
    });

    it('puts every occurrence of an AUTO_ANY schedule on the resource that is free', async () => {
      const taken = await seedFixture('AUTO_CONFIRM');
      await requestSchedule(taken).expect(201); // holds 10:00 on `taken.resourceId` for the term
      const spare = await ds
        .getRepository(ResourceEntity)
        .save(
          new ResourceEntityBuilder()
            .withTenantId(tenantId)
            .withType(ResourceType.ROOM)
            .withName('Sala livre')
            .build(),
        );
      const pooled = await ds
        .getRepository(ServiceEntity)
        .save(
          new ServiceEntityBuilder()
            .withTenantId(tenantId)
            .withName('Sala — qualquer')
            .withRecurrenceEligible(true)
            .withDefaultApprovalMode('AUTO_CONFIRM')
            .withBufferAfterMinutes(0)
            .build(),
        );
      const requirement = await ds
        .getRepository(ServiceResourceRequirementEntity)
        .save(
          new ServiceResourceRequirementEntityBuilder()
            .withTenantId(tenantId)
            .withServiceId(pooled.id)
            .withResourceType(ResourceType.ROOM)
            .withSelectionMode('AUTO_ANY')
            .build(),
        );
      // Restricted to the two rooms of this test, so the tie-break cannot land on a room another
      // test in this file created.
      await ds
        .getRepository(ServiceResourceRequirementPoolEntity)
        .save(
          [taken.resourceId, spare.id].map((resourceId) =>
            new ServiceResourceRequirementPoolEntityBuilder()
              .withTenantId(tenantId)
              .withRequirementId(requirement.id)
              .withResourceId(resourceId)
              .build(),
          ),
        );

      const res = await request(app.getHttpServer())
        .post('/recurring-booking-schedules')
        .set(actorHeaders(tenantId, CUSTOMER_ID, 'CUSTOMER'))
        .send({
          serviceId: pooled.id,
          recurrence: {
            frequency: 'WEEKLY',
            daysOfWeek: ['tuesday'],
            startTime: '10:00',
            durationMinutes: 60,
          },
          assignmentPolicy: 'RESOLVE_PER_OCCURRENCE',
          startsOn: STARTS_ON,
          endsOn: ENDS_ON,
        });

      expect(res.status).toBe(201);
      const occurrences = await bookingsOf(res.body.id);
      expect(occurrences).toHaveLength(5);
      const onSpare = await ds
        .getRepository(ResourceOccupancyEntity)
        .count({ where: { tenantId, resourceId: spare.id, lockState: 'COMMITTED' } });
      expect(onSpare).toBe(5);
    });

    it('the unique key refuses a second booking for the same schedule and start', async () => {
      const fixture = await seedFixture('AUTO_CONFIRM');
      const { body } = await requestSchedule(fixture).expect(201);
      const [existing] = await bookingsOf(body.id);

      const duplicate = new BookingEntityBuilder()
        .withTenantId(tenantId)
        .withRecurringScheduleId(body.id)
        .withScheduledAt(existing.scheduledAt)
        .build();

      await expect(ds.getRepository(BookingEntity).save(duplicate)).rejects.toThrow();
    });
  });

  describe('expiry job', () => {
    it('cancels a real past-deadline request and leaves a live one untouched', async () => {
      const overdueFixture = await seedFixture('MANUAL_APPROVAL');
      const liveFixture = await seedFixture('MANUAL_APPROVAL');
      const { body: overdue } = await requestSchedule(overdueFixture).expect(201);
      const { body: live } = await requestSchedule(liveFixture).expect(201);
      await ds
        .getRepository(RecurringBookingScheduleEntity)
        .update(
          { id: overdue.id, tenantId },
          { approvalHoldExpiresAt: new Date(Date.now() - 1000) },
        );

      const result = await expireJob.run();

      expect(result.expired).toBeGreaterThanOrEqual(1);
      const overdueRow = await scheduleRow(overdue.id);
      expect(overdueRow.status).toBe('CANCELLED');
      expect(overdueRow.cancellationReason).toBe('APPROVAL_EXPIRED');
      expect(overdueRow.approvalHoldExpiresAt).toBeNull();
      expect((await scheduleRow(live.id)).status).toBe('PENDING_APPROVAL');
      expect(await bookingsOf(overdue.id)).toHaveLength(0);
    });

    it('moves an ACTIVE schedule whose term is over to ENDED, and only that one', async () => {
      const finishedFixture = await seedFixture('AUTO_CONFIRM');
      const runningFixture = await seedFixture('AUTO_CONFIRM');
      const { body: finished } = await requestSchedule(finishedFixture).expect(201);
      const { body: running } = await requestSchedule(runningFixture).expect(201);
      await ds
        .getRepository(RecurringBookingScheduleEntity)
        .update({ id: finished.id, tenantId }, { endsOn: '2000-01-01' });

      const result = await expireJob.run();

      expect(result.ended).toBeGreaterThanOrEqual(1);
      expect((await scheduleRow(finished.id)).status).toBe('ENDED');
      expect((await scheduleRow(running.id)).status).toBe('ACTIVE');
    });

    it('an ENDED schedule no longer counts toward the resource cap', async () => {
      const fixture = await seedFixture('AUTO_CONFIRM');
      const { body } = await requestSchedule(fixture).expect(201);
      await ds
        .getRepository(RecurringBookingScheduleEntity)
        .update({ id: body.id, tenantId }, { endsOn: '2000-01-01' });
      await expireJob.run();

      const active = await ds.getRepository(RecurringBookingScheduleEntity).count({
        where: { tenantId, status: 'ACTIVE', id: body.id },
      });
      expect(active).toBe(0);
    });

    it("never touches another tenant's schedules", async () => {
      const fixture = await seedFixture('MANUAL_APPROVAL');
      const { body: mine } = await requestSchedule(fixture).expect(201);
      await ds
        .getRepository(RecurringBookingScheduleEntity)
        .update({ id: mine.id, tenantId }, { approvalHoldExpiresAt: new Date(Date.now() - 1000) });

      await expireJob.run();

      // The row belongs to tenant A; tenant B has no schedule rows at all.
      const otherTenantRows = await ds
        .getRepository(RecurringBookingScheduleEntity)
        .count({ where: { tenantId: otherTenantId } });
      expect(otherTenantRows).toBe(0);
      expect((await scheduleRow(mine.id)).status).toBe('CANCELLED');
    });
  });

  describe('migration', () => {
    it('accepts ENDED in the status column and still refuses an unknown status', async () => {
      const fixture = await seedFixture('AUTO_CONFIRM');
      const { body } = await requestSchedule(fixture).expect(201);

      await ds
        .getRepository(RecurringBookingScheduleEntity)
        .update({ id: body.id, tenantId }, { status: 'ENDED' });
      expect((await scheduleRow(body.id)).status).toBe('ENDED');

      await expect(
        ds
          .getRepository(RecurringBookingScheduleEntity)
          .update({ id: body.id, tenantId }, { status: 'PAUSED' as 'ENDED' }),
      ).rejects.toThrow();
    });
  });
});
