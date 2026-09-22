import { IServiceIntakeSchemaRepository } from '../../../contexts/booking/application/ports/service-intake-schema-repository.port';
import { ServiceBookingIntakeSchema } from '../../../contexts/booking/domain/service-booking-intake-schema';

export class InMemoryServiceIntakeSchemaRepository implements IServiceIntakeSchemaRepository {
  private readonly store = new Map<string, ServiceBookingIntakeSchema>();

  async findActiveByServiceId(
    serviceId: string,
    tenantId: string,
  ): Promise<ServiceBookingIntakeSchema | null> {
    return (
      Array.from(this.store.values()).find(
        (s) => s.serviceId === serviceId && s.tenantId === tenantId && s.isActive,
      ) ?? null
    );
  }

  async findAllByServiceId(
    serviceId: string,
    tenantId: string,
  ): Promise<ServiceBookingIntakeSchema[]> {
    return Array.from(this.store.values())
      .filter((s) => s.serviceId === serviceId && s.tenantId === tenantId)
      .sort((a, b) => a.version - b.version);
  }

  async findLatestByServiceId(
    serviceId: string,
    tenantId: string,
    limit: number,
  ): Promise<ServiceBookingIntakeSchema[]> {
    return Array.from(this.store.values())
      .filter((s) => s.serviceId === serviceId && s.tenantId === tenantId)
      .sort((a, b) => b.version - a.version)
      .slice(0, limit);
  }

  async publish(schema: ServiceBookingIntakeSchema): Promise<void> {
    for (const [key, existing] of this.store.entries()) {
      if (
        existing.serviceId === schema.serviceId &&
        existing.tenantId === schema.tenantId &&
        existing.isActive
      ) {
        this.store.set(
          key,
          ServiceBookingIntakeSchema.reconstitute({
            id: existing.id,
            tenantId: existing.tenantId,
            serviceId: existing.serviceId,
            version: existing.version,
            questions: existing.questions,
            consentText: existing.consentText,
            consentVersion: existing.consentVersion,
            requiresNamedAttendees: existing.requiresNamedAttendees,
            participantCountRequired: existing.participantCountRequired,
            isActive: false,
            createdAt: existing.createdAt,
          }),
        );
      }
    }
    this.store.set(schema.id, schema);
  }
}
