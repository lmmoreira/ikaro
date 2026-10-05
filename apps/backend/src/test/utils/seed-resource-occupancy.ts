import { DataSource } from 'typeorm';
import {
  BookingEntityBuilder,
  BookingLineEntityBuilder,
  BookingLineResourceAssignmentEntityBuilder,
  ResourceOccupancyEntityBuilder,
  ServiceEntityBuilder,
} from '../builders/booking/index';
import { BookingEntity } from '../../contexts/booking/infrastructure/entities/booking.entity';
import { BookingLineEntity } from '../../contexts/booking/infrastructure/entities/booking-line.entity';
import { BookingLineResourceAssignmentEntity } from '../../contexts/booking/infrastructure/entities/booking-line-resource-assignment.entity';
import { ResourceOccupancyEntity } from '../../contexts/booking/infrastructure/entities/resource-occupancy.entity';
import { ServiceEntity } from '../../contexts/booking/infrastructure/entities/service.entity';
import { ResourceGapSource } from '../../contexts/booking/domain/resource-gap-source';
import { ResourceType } from '../../contexts/booking/domain/resource.types';

export interface OccupiedBlockSpec {
  resourceType: ResourceType;
  lockState: 'REQUESTED' | 'HOLD' | 'COMMITTED';
  startsAt: Date;
  endsAt: Date;
  // The gap behind endsAt and the booking line's service-name snapshot (M18-S10); omitted = a row
  // written before the gap was recorded.
  gap?: { minutes: number; source: ResourceGapSource };
  serviceName?: string;
}

// Real composite FKs require a genuinely persisted service + booking + line + assignment before a
// resource_occupancy row can reference one — same discipline as
// typeorm-resource-occupancy.repository.integration.spec.ts.
export async function seedOccupiedBlockWithSpec(
  ds: DataSource,
  tenantId: string,
  resourceId: string,
  spec: OccupiedBlockSpec,
): Promise<{ bookingId: string }> {
  const { resourceType, lockState, startsAt, endsAt, gap, serviceName } = spec;
  const service = new ServiceEntityBuilder().withTenantId(tenantId).build();
  await ds.getRepository(ServiceEntity).save(service);
  const booking = new BookingEntityBuilder().withTenantId(tenantId).build();
  await ds.getRepository(BookingEntity).save(booking);
  const line = new BookingLineEntityBuilder()
    .withTenantId(tenantId)
    .withBookingId(booking.id)
    .withServiceId(service.id)
    .withServiceNameAtBooking(serviceName ?? 'Lavagem Básica')
    .build();
  await ds.getRepository(BookingLineEntity).save(line);
  const assignment = new BookingLineResourceAssignmentEntityBuilder()
    .withTenantId(tenantId)
    .withBookingLineId(line.lineId)
    .withResourceId(resourceId)
    .withResourceType(resourceType)
    .build();
  await ds.getRepository(BookingLineResourceAssignmentEntity).save(assignment);
  const occupancy = new ResourceOccupancyEntityBuilder()
    .withTenantId(tenantId)
    .withResourceId(resourceId)
    .withResourceType(resourceType)
    .withBookingLineResourceAssignmentId(assignment.id)
    .withLockState(lockState)
    .withStartsAt(startsAt)
    .withEndsAt(endsAt)
    .withGap(gap?.minutes ?? null, gap?.source ?? null)
    .build();
  await ds.getRepository(ResourceOccupancyEntity).save(occupancy);
  return { bookingId: booking.id };
}

export function seedOccupiedBlock(
  ds: DataSource,
  tenantId: string,
  resourceId: string,
  resourceType: ResourceType,
  lockState: OccupiedBlockSpec['lockState'],
  startsAt: Date,
  endsAt: Date,
): Promise<{ bookingId: string }> {
  return seedOccupiedBlockWithSpec(ds, tenantId, resourceId, {
    resourceType,
    lockState,
    startsAt,
    endsAt,
  });
}
