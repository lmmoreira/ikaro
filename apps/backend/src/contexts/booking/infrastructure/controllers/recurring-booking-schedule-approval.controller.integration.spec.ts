import request from 'supertest';
import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';

import {
  BookingEntityBuilder,
  BookingLineEntityBuilder,
  BookingLineResourceAssignmentEntityBuilder,
  ResourceEntityBuilder,
  ResourceOccupancyEntityBuilder,
  ScheduleClosureEntityBuilder,
  ServiceEntityBuilder,
  ServiceResourceRequirementEntityBuilder,
  ServiceResourceRequirementPoolEntityBuilder,
} from '../../../../test/builders/booking/index';
import { CustomerEntityBuilder } from '../../../../test/builders/customer/index';
import { uuidv7 } from '../../../../shared/domain/uuid-v7';
import { actorHeaders } from '../../../../test/utils/actor-headers';
import { addDays, nextWeekday } from '../../../../test/utils/date-helpers';
import { createBookingIntegrationApp } from '../../../../test/utils/booking-integration-app';
import { ExpireRecurringBookingScheduleApprovalsJob } from '../../application/jobs/expire-recurring-schedule-approvals.job';
import { PlatformModule } from '../../../platform/platform.module';
import { CustomerEntity } from '../../../customer/infrastructure/entities/customer.entity';
import { BookingEntity } from '../entities/booking.entity';
import { BookingStatusTransitionEntity } from '../entities/booking-status-transition.entity';
import { FutureCommitmentExceptionEntity } from '../entities/future-commitment-exception.entity';
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
      await ds.getRepository(FutureCommitmentExceptionEntity).delete({ tenantId: id });
      await ds.getRepository(BookingStatusTransitionEntity).delete({ tenantId: id });
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
        resourceSelections: [{ resourceType: 'ROOM', resourceId: fixture.resourceId }],
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

    // M23-S35 — a request can wait past some of its own occurrences; approval never books one that
    // has already started. The term is moved back after the request, as the passage of time would.
    it('books only the occurrences that have not started when the term began while the request waited', async () => {
      const fixture = await seedFixture('MANUAL_APPROVAL');
      const { body: pending } = await requestSchedule(fixture).expect(201);
      await ds
        .getRepository(RecurringBookingScheduleEntity)
        .update(
          { id: pending.id, tenantId },
          { startsOn: addDays(STARTS_ON, -14), endsOn: addDays(STARTS_ON, 14) },
        );
      // Tuesdays N-14 .. N+14 at 10:00 São Paulo (13:00Z); N-7 may or may not have started yet.
      const expected = [-14, -7, 0, 7, 14].filter(
        (offset) => new Date(`${addDays(STARTS_ON, offset)}T13:00:00.000Z`) > new Date(),
      ).length;

      const { body } = await decide(pending.id, 'approve').expect(200);

      expect(body.occurrenceCount).toBe(expected);
      const bookings = await bookingsOf(pending.id);
      expect(bookings).toHaveLength(expected);
      expect(bookings.every((b) => b.scheduledAt > new Date())).toBe(true);
      expect((await scheduleRow(pending.id)).status).toBe('ACTIVE');
    });

    it('answers 422 BOOKING_SCHEDULED_IN_PAST when the whole term started while it waited, leaving the request pending', async () => {
      const fixture = await seedFixture('MANUAL_APPROVAL');
      const { body: pending } = await requestSchedule(fixture).expect(201);
      await ds
        .getRepository(RecurringBookingScheduleEntity)
        .update(
          { id: pending.id, tenantId },
          { startsOn: addDays(STARTS_ON, -21), endsOn: addDays(STARTS_ON, -8) },
        );

      const res = await decide(pending.id, 'approve').expect(422);

      expect(res.body.code).toBe('BOOKING_SCHEDULED_IN_PAST');
      expect(await bookingsOf(pending.id)).toHaveLength(0);
      const row = await scheduleRow(pending.id);
      expect(row.status).toBe('PENDING_APPROVAL');
      expect(row.approvedByStaffId).toBeNull();
    });

    it('lets exactly one of two concurrent approvals for the same room and slot succeed', async () => {
      const fixture = await seedFixture('MANUAL_APPROVAL');
      const { body: first } = await requestSchedule(fixture).expect(201);
      const { body: second } = await requestSchedule(fixture).expect(201);

      const [one, two] = await Promise.all([
        decide(first.id, 'approve'),
        decide(second.id, 'approve'),
      ]);

      expect([one.status, two.status].sort((a, b) => a - b)).toEqual([200, 409]);
      const held = await ds
        .getRepository(ResourceOccupancyEntity)
        .count({ where: { tenantId, resourceId: fixture.resourceId } });
      expect(held).toBe(5); // one schedule's five occurrences, never both
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

  // TD49 Story 1 — a staff member the customer picks plus a room resolved per occurrence: the
  // schedule is approved, managed and ended with both resources held in every occurrence.
  describe('bundle (staff CUSTOMER_CHOICE + room AUTO_ANY)', () => {
    const MANAGER_ID = '30000000-0000-4000-8000-000000000702';

    async function saveResource(type: ResourceType, forTenantId = tenantId): Promise<string> {
      const resource = new ResourceEntityBuilder()
        .withTenantId(forTenantId)
        .withType(type)
        .withName(`Recurso ${uuidv7()}`)
        .withRefId(type === ResourceType.STAFF ? uuidv7() : null)
        .build();
      await ds.getRepository(ResourceEntity).save(resource);
      return resource.id;
    }

    async function seedBundle() {
      const service = await ds
        .getRepository(ServiceEntity)
        .save(
          new ServiceEntityBuilder()
            .withTenantId(tenantId)
            .withName('Estúdio + instrutor')
            .withRecurrenceEligible(true)
            .withDefaultApprovalMode('MANUAL_APPROVAL')
            .withBufferAfterMinutes(0)
            .build(),
        );
      await ds
        .getRepository(ServiceResourceRequirementEntity)
        .save(
          new ServiceResourceRequirementEntityBuilder()
            .withTenantId(tenantId)
            .withServiceId(service.id)
            .withResourceType(ResourceType.STAFF)
            .withSelectionMode('CUSTOMER_CHOICE')
            .build(),
        );
      const room = await saveResource(ResourceType.ROOM);
      const roomRequirement = new ServiceResourceRequirementEntityBuilder()
        .withTenantId(tenantId)
        .withServiceId(service.id)
        .withResourceType(ResourceType.ROOM)
        .withSelectionMode('AUTO_ANY')
        .build();
      await ds.getRepository(ServiceResourceRequirementEntity).save(roomRequirement);
      // Restricted to the one room so no other test's room takes part.
      await ds
        .getRepository(ServiceResourceRequirementPoolEntity)
        .save(
          new ServiceResourceRequirementPoolEntityBuilder()
            .withTenantId(tenantId)
            .withRequirementId(roomRequirement.id)
            .withResourceId(room)
            .build(),
        );
      const staff = await saveResource(ResourceType.STAFF);
      return { serviceId: service.id, staff, room };
    }

    async function requestBundle(bundle: { serviceId: string; staff: string }): Promise<string> {
      const res = await request(app.getHttpServer())
        .post('/recurring-booking-schedules')
        .set(actorHeaders(tenantId, CUSTOMER_ID, 'CUSTOMER'))
        .send({
          serviceId: bundle.serviceId,
          recurrence: {
            frequency: 'WEEKLY',
            daysOfWeek: ['tuesday'],
            startTime: '10:00',
            durationMinutes: 60,
          },
          resourceSelections: [{ resourceType: 'STAFF', resourceId: bundle.staff }],
          startsOn: STARTS_ON,
          endsOn: ENDS_ON,
        })
        .expect(201);
      return res.body.id as string;
    }

    // An existing booking that holds `resourceId` from `startsAt` for an hour.
    async function seedBusy(resourceId: string, type: ResourceType, startsAt: Date): Promise<void> {
      const service = await ds
        .getRepository(ServiceEntity)
        .save(new ServiceEntityBuilder().withTenantId(tenantId).build());
      const booking = await ds
        .getRepository(BookingEntity)
        .save(new BookingEntityBuilder().withTenantId(tenantId).build());
      const line = await ds
        .getRepository(BookingLineEntity)
        .save(
          new BookingLineEntityBuilder()
            .withTenantId(tenantId)
            .withBookingId(booking.id)
            .withServiceId(service.id)
            .build(),
        );
      const assignment = await ds
        .getRepository(BookingLineResourceAssignmentEntity)
        .save(
          new BookingLineResourceAssignmentEntityBuilder()
            .withTenantId(tenantId)
            .withBookingLineId(line.lineId)
            .withResourceId(resourceId)
            .withResourceType(type)
            .build(),
        );
      await ds.getRepository(ResourceOccupancyEntity).save(
        new ResourceOccupancyEntityBuilder()
          .withTenantId(tenantId)
          .withResourceId(resourceId)
          .withResourceType(type)
          .withBookingLineResourceAssignmentId(assignment.id)
          .withLockState('COMMITTED')
          .withStartsAt(startsAt)
          .withEndsAt(new Date(startsAt.getTime() + 3_600_000))
          .build(),
      );
    }

    const occupancyOf = (resourceId: string, forTenantId = tenantId) =>
      ds.getRepository(ResourceOccupancyEntity).find({
        where: { tenantId: forTenantId, resourceId },
        order: { startsAt: 'ASC' },
      });

    // The resources a set of bookings currently occupies (the live projection).
    const occupiedBy = async (bookingIds: string[]): Promise<string[]> => {
      const rows: { resource_id: string }[] = await ds.query(
        `SELECT ro.resource_id
           FROM booking.resource_occupancy ro
           JOIN booking.booking_line_resource_assignments bla
             ON bla.tenant_id = ro.tenant_id AND bla.id = ro.booking_line_resource_assignment_id
           JOIN booking.booking_lines bl
             ON bl.tenant_id = bla.tenant_id AND bl.line_id = bla.booking_line_id
          WHERE ro.tenant_id = $1 AND bl.booking_id = ANY($2)
          ORDER BY ro.resource_id`,
        [tenantId, bookingIds],
      );
      return rows.map((r) => r.resource_id);
    };

    async function approvedBundle() {
      const bundle = await seedBundle();
      const id = await requestBundle(bundle);
      await decide(id, 'approve').expect(200);
      const bookings = (await bookingsOf(id)).sort(
        (a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime(),
      );
      return { ...bundle, id, bookings };
    }

    it('approving holds both resources in every occurrence and the read lists the stored pick by type', async () => {
      const bundle = await seedBundle();
      const id = await requestBundle(bundle);
      expect(await occupancyOf(bundle.room)).toHaveLength(0);

      const { body } = await decide(id, 'approve').expect(200);

      expect(body).toEqual({ id, status: 'ACTIVE', occurrenceCount: 5 });
      const staffRows = await occupancyOf(bundle.staff);
      const roomRows = await occupancyOf(bundle.room);
      expect(staffRows).toHaveLength(5);
      expect(roomRows).toHaveLength(5);
      expect([...staffRows, ...roomRows].every((o) => o.lockState === 'COMMITTED')).toBe(true);

      const read = await request(app.getHttpServer())
        .get(`/recurring-booking-schedules/${id}`)
        .set(actorHeaders(tenantId, CUSTOMER_ID, 'CUSTOMER'))
        .expect(200);
      expect(read.body.resourceAssignments).toEqual([
        { resourceType: 'STAFF', resourceId: bundle.staff },
      ]);
      expect(read.body.resourceIds).toEqual([bundle.staff]);
    });

    it('refuses the whole approval when the staff member became busy while it waited, holding nothing', async () => {
      const bundle = await seedBundle();
      const id = await requestBundle(bundle);
      await seedBusy(
        bundle.staff,
        ResourceType.STAFF,
        new Date(`${addDays(STARTS_ON, 14)}T13:00:00.000Z`),
      );

      const res = await decide(id, 'approve').expect(409);

      expect(res.body.code).toBe('BOOKING_RECURRING_SCHEDULE_CONFLICT');
      expect(await bookingsOf(id)).toHaveLength(0);
      expect((await scheduleRow(id)).status).toBe('PENDING_APPROVAL');
      expect(await occupancyOf(bundle.room)).toHaveLength(0);
      expect(await occupancyOf(bundle.staff)).toHaveLength(1); // only the seeded one
    });

    it('ending the schedule releases both resources of every future occurrence', async () => {
      const bundle = await approvedBundle();

      await request(app.getHttpServer())
        .post(`/recurring-booking-schedules/${bundle.id}/end`)
        .set(actorHeaders(tenantId, CUSTOMER_ID, 'CUSTOMER'))
        .expect(200);

      expect(await occupancyOf(bundle.staff)).toHaveLength(0);
      expect(await occupancyOf(bundle.room)).toHaveLength(0);
    });

    it("never lets another tenant's actor end it or touch its occupancy", async () => {
      const bundle = await approvedBundle();

      await request(app.getHttpServer())
        .post(`/recurring-booking-schedules/${bundle.id}/end`)
        .set(actorHeaders(otherTenantId, CUSTOMER_ID, 'CUSTOMER'))
        .expect(404);

      expect(await occupancyOf(bundle.staff)).toHaveLength(5);
      expect(await occupancyOf(bundle.room)).toHaveLength(5);
      expect(await occupancyOf(bundle.staff, otherTenantId)).toHaveLength(0);
    });

    it('cancelling one occurrence releases its two rows and leaves the others held', async () => {
      const bundle = await approvedBundle();
      const victim = bundle.bookings[0];

      await request(app.getHttpServer())
        .patch(`/bookings/${victim.id}/cancel-admin`)
        .set(actorHeaders(tenantId, MANAGER_ID, 'MANAGER'))
        .send({ reason: 'Instrutor indisponível nesta data' })
        .expect(200);

      expect(await occupiedBy([victim.id])).toEqual([]);
      expect(await occupancyOf(bundle.staff)).toHaveLength(4);
      expect(await occupancyOf(bundle.room)).toHaveLength(4);
    });

    it('rescheduling one occurrence keeps the pinned staff member and moves both rows', async () => {
      const bundle = await approvedBundle();
      const target = bundle.bookings[0];
      const newStart = new Date(target.scheduledAt.getTime() + 2 * 3_600_000);

      await request(app.getHttpServer())
        .patch(`/bookings/${target.id}/reschedule-admin`)
        .set(actorHeaders(tenantId, MANAGER_ID, 'MANAGER'))
        .send({ scheduledAt: newStart.toISOString() })
        .expect(200);

      expect((await occupiedBy([target.id])).sort()).toEqual([bundle.room, bundle.staff].sort());
      for (const resourceId of [bundle.staff, bundle.room]) {
        const rows = await occupancyOf(resourceId);
        expect(rows).toHaveLength(5);
        expect(rows.filter((o) => o.startsAt.getTime() === newStart.getTime())).toHaveLength(1);
      }
    });

    it('a bulk reassign of the staff pick moves the schedule assignment with it', async () => {
      const bundle = await approvedBundle();
      const replacement = await saveResource(ResourceType.STAFF);
      const manager = actorHeaders(tenantId, MANAGER_ID, 'MANAGER');
      await request(app.getHttpServer())
        .delete(`/resources/${bundle.staff}`)
        .set(manager)
        .expect(204);
      const { body: open } = await request(app.getHttpServer())
        .get('/scheduling-exceptions')
        .set(manager)
        .expect(200);
      const entries = (open.items as { id: string; affectedId: string }[]).filter((e) =>
        bundle.bookings.some((b) => b.id === e.affectedId),
      );
      expect(entries).toHaveLength(5);

      const { body } = await request(app.getHttpServer())
        .post('/scheduling-exceptions/resolve')
        .set(manager)
        .send({
          exceptionIds: entries.map((e) => e.id),
          resolutionType: 'REASSIGN',
          target: { resourceId: replacement },
        })
        .expect(200);

      expect((body.results as { outcome: string }[]).map((r) => r.outcome)).toEqual(
        Array(5).fill('RESOLVED'),
      );
      expect(await occupancyOf(replacement)).toHaveLength(5);
      expect(await occupancyOf(bundle.room)).toHaveLength(5);
      const read = await request(app.getHttpServer())
        .get(`/recurring-booking-schedules/${bundle.id}`)
        .set(actorHeaders(tenantId, CUSTOMER_ID, 'CUSTOMER'))
        .expect(200);
      expect(read.body.resourceAssignments).toEqual([
        { resourceType: 'STAFF', resourceId: replacement },
      ]);
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
