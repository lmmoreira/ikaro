import { ResourceOccupiedSlot } from '../../domain/resource-occupied-slot';

export const BOOKING_AVAILABILITY_PORT = Symbol('IBookingAvailabilityPort');

export interface IBookingAvailabilityPort {
  findOccupancyByTenantAndResource(
    tenantId: string,
    resourceIds: string[],
    from: string,
    to: string,
  ): Promise<ResourceOccupiedSlot[]>;
}
