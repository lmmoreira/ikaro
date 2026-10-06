import { DataSource, In } from 'typeorm';
import { uuidv7 } from '../../shared/domain/uuid-v7';
import {
  BookingEntityBuilder,
  BookingLineEntityBuilder,
  BookingLineResourceAssignmentEntityBuilder,
  ResourceEntityBuilder,
  ResourceOccupancyEntityBuilder,
  ServiceEntityBuilder,
  ServiceResourceRequirementEntityBuilder,
  ServiceResourceRequirementPoolEntityBuilder,
} from '../builders/booking/index';
import { ResourceOccupancyLockState } from '../../contexts/booking/domain/resource-occupancy-lock-state';
import { ResourceType } from '../../contexts/booking/domain/resource.types';
import { BookingEntity } from '../../contexts/booking/infrastructure/entities/booking.entity';
import { BookingLineEntity } from '../../contexts/booking/infrastructure/entities/booking-line.entity';
import { BookingLineResourceAssignmentEntity } from '../../contexts/booking/infrastructure/entities/booking-line-resource-assignment.entity';
import { BookingStatusTransitionEntity } from '../../contexts/booking/infrastructure/entities/booking-status-transition.entity';
import { FutureCommitmentExceptionEntity } from '../../contexts/booking/infrastructure/entities/future-commitment-exception.entity';
import { RecurringBookingScheduleEntity } from '../../contexts/booking/infrastructure/entities/recurring-booking-schedule.entity';
import { RecurringBookingScheduleResourceAssignmentEntity } from '../../contexts/booking/infrastructure/entities/recurring-booking-schedule-resource-assignment.entity';
import { ResourceEntity } from '../../contexts/booking/infrastructure/entities/resource.entity';
import { ResourceOccupancyEntity } from '../../contexts/booking/infrastructure/entities/resource-occupancy.entity';
import { ServiceEntity } from '../../contexts/booking/infrastructure/entities/service.entity';
import {
  ServiceResourceRequirementEntity,
  ServiceResourceRequirementPoolEntity,
} from '../../contexts/booking/infrastructure/entities/service-resource-requirement.entity';

// Real-database seeding for the worklist's integration specs (M23-S08): the same rows a real
// booking flow leaves behind — booking, line, resolved assignment and its resource_occupancy row.

export async function seedResource(
  ds: DataSource,
  tenantId: string,
  name: string,
  type: ResourceType = ResourceType.ROOM,
): Promise<ResourceEntity> {
  const builder = new ResourceEntityBuilder().withTenantId(tenantId).withType(type).withName(name);
  if (type === ResourceType.STAFF) builder.withRefId(uuidv7());
  return ds.getRepository(ResourceEntity).save(builder.build());
}

// A service whose flat requirement is one resource of `type`, AUTO_ANY, optionally restricted to a pool.
export async function seedService(
  ds: DataSource,
  tenantId: string,
  options: { type?: ResourceType; poolResourceIds?: string[] } = {},
): Promise<ServiceEntity> {
  const service = await ds
    .getRepository(ServiceEntity)
    .save(new ServiceEntityBuilder().withTenantId(tenantId).withName('Sessão').build());
  const requirement = await ds.getRepository(ServiceResourceRequirementEntity).save(
    new ServiceResourceRequirementEntityBuilder()
      .withTenantId(tenantId)
      .withServiceId(service.id)
      .withResourceType(options.type ?? ResourceType.ROOM)
      .withSelectionMode('AUTO_ANY')
      .build(),
  );
  const poolResourceIds = options.poolResourceIds ?? [];
  if (poolResourceIds.length > 0) {
    await ds
      .getRepository(ServiceResourceRequirementPoolEntity)
      .save(
        poolResourceIds.map((resourceId) =>
          new ServiceResourceRequirementPoolEntityBuilder()
            .withTenantId(tenantId)
            .withRequirementId(requirement.id)
            .withResourceId(resourceId)
            .build(),
        ),
      );
  }
  return service;
}

export interface SeedFutureBookingOptions {
  tenantId: string;
  serviceId: string;
  resource: Pick<ResourceEntity, 'id' | 'name' | 'type'>;
  startsInHours: number;
  durationMins?: number;
  status?: string;
  lockState?: ResourceOccupancyLockState;
  recurringScheduleId?: string | null;
  contactName?: string;
}

export interface SeededBooking {
  bookingId: string;
  lineId: string;
  assignmentId: string;
  startsAt: Date;
  endsAt: Date;
}

export async function seedFutureBooking(
  ds: DataSource,
  options: SeedFutureBookingOptions,
): Promise<SeededBooking> {
  const { tenantId, serviceId, resource } = options;
  const durationMins = options.durationMins ?? 60;
  const startsAt = new Date(Date.now() + options.startsInHours * 3_600_000);
  const endsAt = new Date(startsAt.getTime() + durationMins * 60_000);
  const lockState = options.lockState ?? 'COMMITTED';

  const booking = await ds.getRepository(BookingEntity).save(
    new BookingEntityBuilder()
      .withTenantId(tenantId)
      .withStatus(options.status ?? 'APPROVED')
      .withContactName(options.contactName ?? 'Ana Souza')
      .withScheduledAt(startsAt)
      .withTotalDurationMins(durationMins)
      .withRecurringScheduleId(options.recurringScheduleId ?? null)
      .build(),
  );
  const line = await ds
    .getRepository(BookingLineEntity)
    .save(
      new BookingLineEntityBuilder()
        .withBookingId(booking.id)
        .withTenantId(tenantId)
        .withServiceId(serviceId)
        .withServiceNameAtBooking('Sessão')
        .withDurationMinsAtBooking(durationMins)
        .build(),
    );
  const assignment = await ds
    .getRepository(BookingLineResourceAssignmentEntity)
    .save(
      new BookingLineResourceAssignmentEntityBuilder()
        .withTenantId(tenantId)
        .withBookingLineId(line.lineId)
        .withResourceId(resource.id)
        .withResourceType(resource.type)
        .withResourceNameAtAssignment(resource.name)
        .build(),
    );
  await ds.getRepository(ResourceOccupancyEntity).save(
    new ResourceOccupancyEntityBuilder()
      .withTenantId(tenantId)
      .withResourceId(resource.id)
      .withResourceType(resource.type)
      .withResourceNameAtAssignment(resource.name)
      .withBookingLineResourceAssignmentId(assignment.id)
      .withStartsAt(startsAt)
      .withEndsAt(endsAt)
      .withLockState(lockState)
      .withHoldExpiresAt(lockState === 'HOLD' ? new Date(Date.now() + 3_600_000) : null)
      .build(),
  );
  return {
    bookingId: booking.id,
    lineId: line.lineId,
    assignmentId: assignment.id,
    startsAt,
    endsAt,
  };
}

// The resource each of a booking's lines currently occupies (the live projection, not the audit table).
export async function occupiedResourceIds(
  ds: DataSource,
  tenantId: string,
  bookingId: string,
): Promise<string[]> {
  const rows: { resource_id: string }[] = await ds.query(
    `SELECT ro.resource_id
       FROM booking.resource_occupancy ro
       JOIN booking.booking_line_resource_assignments bla
         ON bla.tenant_id = ro.tenant_id AND bla.id = ro.booking_line_resource_assignment_id
       JOIN booking.booking_lines bl
         ON bl.tenant_id = bla.tenant_id AND bl.line_id = bla.booking_line_id
      WHERE ro.tenant_id = $1 AND bl.booking_id = $2
      ORDER BY ro.starts_at`,
    [tenantId, bookingId],
  );
  return rows.map((r) => r.resource_id);
}

export async function cleanupFutureCommitmentTenant(
  ds: DataSource,
  tenantIds: string[],
): Promise<void> {
  const tenantId = In(tenantIds);
  await ds.getRepository(FutureCommitmentExceptionEntity).delete({ tenantId });
  await ds.getRepository(ResourceOccupancyEntity).delete({ tenantId });
  await ds.getRepository(BookingLineResourceAssignmentEntity).delete({ tenantId });
  await ds.getRepository(BookingLineEntity).delete({ tenantId });
  await ds.getRepository(BookingStatusTransitionEntity).delete({ tenantId });
  await ds.getRepository(BookingEntity).delete({ tenantId });
  await ds.getRepository(RecurringBookingScheduleResourceAssignmentEntity).delete({ tenantId });
  await ds.getRepository(RecurringBookingScheduleEntity).delete({ tenantId });
  await ds.getRepository(ServiceResourceRequirementPoolEntity).delete({ tenantId });
  await ds.getRepository(ServiceResourceRequirementEntity).delete({ tenantId });
  await ds.getRepository(ServiceEntity).delete({ tenantId });
  await ds.getRepository(ResourceEntity).delete({ tenantId });
}
