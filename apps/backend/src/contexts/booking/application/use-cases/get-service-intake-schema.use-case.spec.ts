import { InMemoryServiceIntakeSchemaRepository } from '../../../../test/repositories/booking/in-memory-service-intake-schema.repository';
import { InMemoryServiceRepository } from '../../../../test/repositories/booking/in-memory-service.repository';
import { ServiceBuilder } from '../../../../test/builders/booking/index';
import { ServiceNotFoundError } from '../../domain/errors/booking-domain.error';
import { ServiceBookingIntakeSchema } from '../../domain/service-booking-intake-schema';
import { GetServiceIntakeSchemaUseCase } from './get-service-intake-schema.use-case';

const TENANT_A = '10000000-0000-4000-8000-000000000001';
const TENANT_B = '10000000-0000-4000-8000-000000000002';

function question(fieldKey = 'accessNeeds') {
  return {
    fieldKey,
    label: 'Necessidades de acesso',
    type: 'FREE_TEXT' as const,
    required: false,
  };
}

describe('GetServiceIntakeSchemaUseCase', () => {
  let serviceRepo: InMemoryServiceRepository;
  let intakeSchemaRepo: InMemoryServiceIntakeSchemaRepository;
  let useCase: GetServiceIntakeSchemaUseCase;

  beforeEach(() => {
    serviceRepo = new InMemoryServiceRepository();
    intakeSchemaRepo = new InMemoryServiceIntakeSchemaRepository();
    useCase = new GetServiceIntakeSchemaUseCase(serviceRepo, intakeSchemaRepo);
  });

  it('returns active: null and an empty history when the service has never published a schema', async () => {
    const service = new ServiceBuilder().withTenantId(TENANT_A).build();
    await serviceRepo.save(service);

    const result = await useCase.execute({ id: service.id, tenantId: TENANT_A });

    expect(result.active).toBeNull();
    expect(result.history).toEqual([]);
  });

  it('separates the active version from superseded versions in history', async () => {
    const service = new ServiceBuilder().withTenantId(TENANT_A).build();
    await serviceRepo.save(service);
    await intakeSchemaRepo.publish(
      ServiceBookingIntakeSchema.publish({
        tenantId: TENANT_A,
        serviceId: service.id,
        previousVersion: 0,
        questions: [question()],
        consentText: 'v1',
        requiresNamedAttendees: false,
        participantCountRequired: false,
      }),
    );
    await intakeSchemaRepo.publish(
      ServiceBookingIntakeSchema.publish({
        tenantId: TENANT_A,
        serviceId: service.id,
        previousVersion: 1,
        questions: [question('other')],
        consentText: 'v2',
        requiresNamedAttendees: true,
        participantCountRequired: true,
      }),
    );

    const result = await useCase.execute({ id: service.id, tenantId: TENANT_A });

    expect(result.active?.version).toBe(2);
    expect(result.active?.consentText).toBe('v2');
    expect(result.history).toHaveLength(1);
    expect(result.history[0]?.version).toBe(1);
  });

  it('caps history at the 5 most recent previous versions and keeps the active one', async () => {
    const service = new ServiceBuilder().withTenantId(TENANT_A).build();
    await serviceRepo.save(service);
    for (let previousVersion = 0; previousVersion < 8; previousVersion += 1) {
      await intakeSchemaRepo.publish(
        ServiceBookingIntakeSchema.publish({
          tenantId: TENANT_A,
          serviceId: service.id,
          previousVersion,
          questions: [question()],
          consentText: `v${previousVersion + 1}`,
          requiresNamedAttendees: false,
          participantCountRequired: false,
        }),
      );
    }

    const result = await useCase.execute({ id: service.id, tenantId: TENANT_A });

    expect(result.active?.version).toBe(8);
    expect(result.history.map((version) => version.version).sort((a, b) => b - a)).toEqual([
      7, 6, 5, 4, 3,
    ]);
  });

  it('throws ServiceNotFoundError when the service does not exist', async () => {
    await expect(useCase.execute({ id: 'missing', tenantId: TENANT_A })).rejects.toThrow(
      ServiceNotFoundError,
    );
  });

  it('tenant isolation: a cross-tenant service id is treated as not found', async () => {
    const service = new ServiceBuilder().withTenantId(TENANT_A).build();
    await serviceRepo.save(service);

    await expect(useCase.execute({ id: service.id, tenantId: TENANT_B })).rejects.toThrow(
      ServiceNotFoundError,
    );
  });
});
