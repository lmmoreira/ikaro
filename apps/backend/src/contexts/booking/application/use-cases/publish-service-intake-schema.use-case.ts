import { Inject, Injectable } from '@nestjs/common';
import {
  ITransactionManager,
  TRANSACTION_MANAGER,
} from '../../../../shared/ports/transaction-manager.port';
import {
  BookingServiceBookingConfigModelMismatchError,
  ServiceNotFoundError,
} from '../../domain/errors/booking-domain.error';
import {
  ServiceBookingIntakeSchema,
  ServiceIntakeQuestion,
} from '../../domain/service-booking-intake-schema';
import { PublishServiceIntakeSchemaDto } from '../dtos/publish-service-intake-schema.dto';
import { BOOKING_PLATFORM_PORT, IBookingPlatformPort } from '../ports/booking-platform.port';
import {
  IServiceIntakeSchemaRepository,
  SERVICE_INTAKE_SCHEMA_REPOSITORY,
} from '../ports/service-intake-schema-repository.port';
import { IServiceRepository, SERVICE_REPOSITORY } from '../ports/service-repository.port';

export type PublishServiceIntakeSchemaUseCaseInput = PublishServiceIntakeSchemaDto & {
  id: string;
  tenantId: string;
};

export interface PublishServiceIntakeSchemaUseCaseResult {
  id: string;
  version: number;
  questions: ServiceIntakeQuestion[];
  consentText: string;
  consentVersion: number;
  requiresNamedAttendees: boolean;
  participantCountRequired: boolean;
  createdAt: string;
}

function toResult(schema: ServiceBookingIntakeSchema): PublishServiceIntakeSchemaUseCaseResult {
  return {
    id: schema.id,
    version: schema.version,
    questions: schema.questions,
    consentText: schema.consentText,
    consentVersion: schema.consentVersion,
    requiresNamedAttendees: schema.requiresNamedAttendees,
    participantCountRequired: schema.participantCountRequired,
    createdAt: schema.createdAt.toISOString(),
  };
}

@Injectable()
export class PublishServiceIntakeSchemaUseCase {
  constructor(
    @Inject(SERVICE_REPOSITORY) private readonly serviceRepo: IServiceRepository,
    @Inject(SERVICE_INTAKE_SCHEMA_REPOSITORY)
    private readonly intakeSchemaRepo: IServiceIntakeSchemaRepository,
    @Inject(BOOKING_PLATFORM_PORT) private readonly bookingPlatform: IBookingPlatformPort,
    @Inject(TRANSACTION_MANAGER) private readonly txManager: ITransactionManager,
  ) {}

  async execute(
    input: PublishServiceIntakeSchemaUseCaseInput,
  ): Promise<PublishServiceIntakeSchemaUseCaseResult> {
    const { id, tenantId } = input;

    const schema = await this.txManager.run(async () => {
      // findByIdForUpdate — same row lock as the sibling config-write use cases; also serializes
      // two concurrent publishes for this service against each other (see
      // typeorm-service-intake-schema.repository.ts's publish() comment).
      const service = await this.serviceRepo.findByIdForUpdate(id, tenantId);
      if (!service) throw new ServiceNotFoundError(id);
      // UC-054's own precondition — checked here, not via a Service aggregate setter, since
      // ServiceBookingIntakeSchema has no bookingModel of its own to guard with (story-discovery
      // decision, M22-S02, 2026-09-15).
      if (service.bookingModel !== 'APPOINTMENT') {
        throw new BookingServiceBookingConfigModelMismatchError(id);
      }

      const activeSchema = await this.intakeSchemaRepo.findActiveByServiceId(id, tenantId);
      const newSchema = ServiceBookingIntakeSchema.publish({
        tenantId,
        serviceId: id,
        previousVersion: activeSchema?.version ?? 0,
        questions: input.questions,
        consentText: input.consentText,
        requiresNamedAttendees: input.requiresNamedAttendees ?? false,
        participantCountRequired: input.participantCountRequired ?? false,
      });
      await this.intakeSchemaRepo.publish(newSchema);

      // UC-054 A2 — same transaction as the schema publish above.
      if (newSchema.hasPickupAddressQuestion && !service.requiresPickupAddress) {
        service.requirePickupAddress();
        await this.serviceRepo.save(service);
      }

      return newSchema;
    });

    await this.bookingPlatform.revalidatePublicPages(tenantId);

    return toResult(schema);
  }
}
