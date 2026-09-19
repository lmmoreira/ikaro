import { Inject, Injectable } from '@nestjs/common';
import { SERVICE_INTAKE_HISTORY_LIMIT } from '@ikaro/types';
import { ServiceNotFoundError } from '../../domain/errors/booking-domain.error';
import {
  ServiceBookingIntakeSchema,
  ServiceIntakeQuestion,
} from '../../domain/service-booking-intake-schema';
import {
  IServiceIntakeSchemaRepository,
  SERVICE_INTAKE_SCHEMA_REPOSITORY,
} from '../ports/service-intake-schema-repository.port';
import { IServiceRepository, SERVICE_REPOSITORY } from '../ports/service-repository.port';

export type GetServiceIntakeSchemaUseCaseInput = {
  id: string;
  tenantId: string;
};

export interface ServiceIntakeSchemaVersionResult {
  id: string;
  version: number;
  questions: ServiceIntakeQuestion[];
  consentText: string;
  consentVersion: number;
  requiresNamedAttendees: boolean;
  participantCountRequired: boolean;
  createdAt: string;
}

// UC-054 read path — the previous version(s) a manager can review via the version-history modal,
// never the currently-active one (see `active` below).
export interface GetServiceIntakeSchemaUseCaseResult {
  active: ServiceIntakeSchemaVersionResult | null;
  history: ServiceIntakeSchemaVersionResult[];
}

function toVersionResult(schema: ServiceBookingIntakeSchema): ServiceIntakeSchemaVersionResult {
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
export class GetServiceIntakeSchemaUseCase {
  constructor(
    @Inject(SERVICE_REPOSITORY) private readonly serviceRepo: IServiceRepository,
    @Inject(SERVICE_INTAKE_SCHEMA_REPOSITORY)
    private readonly intakeSchemaRepo: IServiceIntakeSchemaRepository,
  ) {}

  async execute(
    input: GetServiceIntakeSchemaUseCaseInput,
  ): Promise<GetServiceIntakeSchemaUseCaseResult> {
    const { id, tenantId } = input;
    const service = await this.serviceRepo.findById(id, tenantId);
    if (!service) throw new ServiceNotFoundError(id);

    // The active version is always the newest one (publish() deactivates-then-inserts version+1),
    // so the latest LIMIT + 1 rows are the active version plus the LIMIT most recent previous
    // ones — a single bounded read instead of loading every version ever published.
    const latest = await this.intakeSchemaRepo.findLatestByServiceId(
      id,
      tenantId,
      SERVICE_INTAKE_HISTORY_LIMIT + 1,
    );
    const active = latest.find((schema) => schema.isActive) ?? null;
    const history = latest
      .filter((schema) => !schema.isActive)
      .slice(0, SERVICE_INTAKE_HISTORY_LIMIT);

    return {
      active: active ? toVersionResult(active) : null,
      history: history.map(toVersionResult),
    };
  }
}
