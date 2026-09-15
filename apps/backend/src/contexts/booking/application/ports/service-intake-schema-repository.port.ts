import { ServiceBookingIntakeSchema } from '../../domain/service-booking-intake-schema';

export const SERVICE_INTAKE_SCHEMA_REPOSITORY = Symbol('IServiceIntakeSchemaRepository');

export interface IServiceIntakeSchemaRepository {
  // Returns null when the service has never published a schema — the caller treats that as
  // previousVersion=0 (ServiceBookingIntakeSchema.publish() then starts at version 1).
  findActiveByServiceId(
    serviceId: string,
    tenantId: string,
  ): Promise<ServiceBookingIntakeSchema | null>;
  // UC-054's own AC: "the previous version is preserved, not overwritten" — used by the
  // integration test to verify both versions remain queryable after a second publish.
  findAllByServiceId(serviceId: string, tenantId: string): Promise<ServiceBookingIntakeSchema[]>;
  // Deactivates the current active version (if any) and inserts the new one — always called
  // inside the same transaction as Service.save() (PublishServiceIntakeSchemaUseCase).
  publish(schema: ServiceBookingIntakeSchema): Promise<void>;
}
