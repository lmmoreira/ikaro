import { InMemoryBookingPlatformPort } from '../../../../test/infrastructure/in-memory-booking-platform.port';
import { InMemoryTransactionManager } from '../../../../test/infrastructure/in-memory-transaction-manager';
import { InMemoryServiceIntakeSchemaRepository } from '../../../../test/repositories/booking/in-memory-service-intake-schema.repository';
import { InMemoryServiceRepository } from '../../../../test/repositories/booking/in-memory-service.repository';
import { ServiceBuilder } from '../../../../test/builders/booking/index';
import {
  BookingServiceBookingConfigModelMismatchError,
  ServiceNotFoundError,
} from '../../domain/errors/booking-domain.error';
import { PublishServiceIntakeSchemaUseCase } from './publish-service-intake-schema.use-case';

const TENANT_A = '10000000-0000-4000-8000-000000000001';

describe('PublishServiceIntakeSchemaUseCase', () => {
  let serviceRepo: InMemoryServiceRepository;
  let intakeSchemaRepo: InMemoryServiceIntakeSchemaRepository;
  let bookingPlatform: InMemoryBookingPlatformPort;
  let useCase: PublishServiceIntakeSchemaUseCase;

  beforeEach(() => {
    serviceRepo = new InMemoryServiceRepository();
    intakeSchemaRepo = new InMemoryServiceIntakeSchemaRepository();
    bookingPlatform = new InMemoryBookingPlatformPort();
    useCase = new PublishServiceIntakeSchemaUseCase(
      serviceRepo,
      intakeSchemaRepo,
      bookingPlatform,
      new InMemoryTransactionManager(),
    );
  });

  function question(
    overrides: Partial<{
      fieldKey: string;
      label: string;
      type: 'FREE_TEXT' | 'BOOLEAN';
      required: boolean;
    }> = {},
  ) {
    return {
      fieldKey: 'accessNeeds',
      label: 'Necessidades de acesso',
      type: 'FREE_TEXT' as const,
      required: false,
      ...overrides,
    };
  }

  it('publishes the first version, starting at 1', async () => {
    const service = new ServiceBuilder().withTenantId(TENANT_A).build();
    await serviceRepo.save(service);

    const result = await useCase.execute({
      id: service.id,
      tenantId: TENANT_A,
      questions: [question()],
      consentText: 'Concordo com os termos',
      requiresNamedAttendees: false,
      participantCountRequired: false,
    });

    expect(result.version).toBe(1);
    expect(result.consentVersion).toBe(1);
  });

  it('deactivates the previous version and activates the new one (UC-054 step 4)', async () => {
    const service = new ServiceBuilder().withTenantId(TENANT_A).build();
    await serviceRepo.save(service);
    await useCase.execute({
      id: service.id,
      tenantId: TENANT_A,
      questions: [question()],
      consentText: 'v1',
      requiresNamedAttendees: false,
      participantCountRequired: false,
    });

    const second = await useCase.execute({
      id: service.id,
      tenantId: TENANT_A,
      questions: [question({ fieldKey: 'other' })],
      consentText: 'v2',
      requiresNamedAttendees: false,
      participantCountRequired: false,
    });

    expect(second.version).toBe(2);
    const all = await intakeSchemaRepo.findAllByServiceId(service.id, TENANT_A);
    expect(all).toHaveLength(2);
    expect(all.find((s) => s.version === 1)?.isActive).toBe(false);
    expect(all.find((s) => s.version === 2)?.isActive).toBe(true);
  });

  it('rejects on a SESSION service (409)', async () => {
    const sessionService = new ServiceBuilder()
      .withTenantId(TENANT_A)
      .withBookingModel('SESSION')
      .withResourceRequirements([])
      .withBufferAfterMinutes(null)
      .withClassResourceSlots([])
      .build();
    await serviceRepo.save(sessionService);

    await expect(
      useCase.execute({
        id: sessionService.id,
        tenantId: TENANT_A,
        questions: [question()],
        consentText: 'Concordo',
        requiresNamedAttendees: false,
        participantCountRequired: false,
      }),
    ).rejects.toThrow(BookingServiceBookingConfigModelMismatchError);
  });

  it('throws ServiceNotFoundError when the service does not exist', async () => {
    await expect(
      useCase.execute({
        id: 'missing',
        tenantId: TENANT_A,
        questions: [question()],
        consentText: 'Concordo',
        requiresNamedAttendees: false,
        participantCountRequired: false,
      }),
    ).rejects.toThrow(ServiceNotFoundError);
  });

  it('tenant isolation: a cross-tenant service id is treated as not found', async () => {
    const service = new ServiceBuilder().withTenantId(TENANT_A).build();
    await serviceRepo.save(service);

    await expect(
      useCase.execute({
        id: service.id,
        tenantId: '10000000-0000-4000-8000-000000000002',
        questions: [question()],
        consentText: 'Concordo',
        requiresNamedAttendees: false,
        participantCountRequired: false,
      }),
    ).rejects.toThrow(ServiceNotFoundError);
  });
});
