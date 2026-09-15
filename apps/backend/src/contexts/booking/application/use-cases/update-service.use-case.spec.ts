import { InMemoryBookingPlatformPort } from '../../../../test/infrastructure/in-memory-booking-platform.port';
import { InMemoryTransactionManager } from '../../../../test/infrastructure/in-memory-transaction-manager';
import { InMemoryBookingRepository } from '../../../../test/repositories/booking/in-memory-booking.repository';
import { InMemoryServiceRepository } from '../../../../test/repositories/booking/in-memory-service.repository';
import {
  BookingLineBuilder,
  BookingBuilder,
  ServiceBuilder,
} from '../../../../test/builders/booking/index';
import {
  BookingDomainError,
  BookingServiceBookingModelImmutableError,
  BookingServiceHasLegsError,
  ServiceDeactivatedError,
  ServiceNotFoundError,
} from '../../domain/errors/booking-domain.error';
import { ServiceLeg } from '../../domain/service-leg';
import { ResourceRequirement } from '../../domain/resource-requirement';
import { ResourceType } from '../../domain/resource.types';
import { UpdateServiceUseCase } from './update-service.use-case';

const TENANT_A = '10000000-0000-4000-8000-000000000001';
const TENANT_B = '10000000-0000-4000-8000-000000000002';

describe('UpdateServiceUseCase', () => {
  let repo: InMemoryServiceRepository;
  let bookingRepo: InMemoryBookingRepository;
  let bookingPlatform: InMemoryBookingPlatformPort;
  let useCase: UpdateServiceUseCase;

  beforeEach(() => {
    repo = new InMemoryServiceRepository();
    bookingRepo = new InMemoryBookingRepository();
    bookingPlatform = new InMemoryBookingPlatformPort();
    useCase = new UpdateServiceUseCase(
      repo,
      bookingRepo,
      bookingPlatform,
      new InMemoryTransactionManager(),
    );
  });

  it('revalidates the public pages for the service tenant', async () => {
    const service = new ServiceBuilder().withTenantId(TENANT_A).build();
    await repo.save(service);

    await useCase.execute({
      id: service.id,
      tenantId: TENANT_A,
      currency: 'BRL',
      locale: 'pt-BR',
      name: 'Novo Nome',
    });

    expect(bookingPlatform.revalidatedTenantIds).toEqual([TENANT_A]);
  });

  it('reads the service under a row lock (findByIdForUpdate), not a plain findById', async () => {
    const service = new ServiceBuilder().withTenantId(TENANT_A).build();
    await repo.save(service);
    const findByIdForUpdateSpy = jest.spyOn(repo, 'findByIdForUpdate');
    const findByIdSpy = jest.spyOn(repo, 'findById');

    await useCase.execute({
      id: service.id,
      tenantId: TENANT_A,
      currency: 'BRL',
      locale: 'pt-BR',
      name: 'Novo Nome',
    });

    expect(findByIdForUpdateSpy).toHaveBeenCalledWith(service.id, TENANT_A);
    expect(findByIdSpy).not.toHaveBeenCalled();
  });

  it('updates only the provided fields; unspecified fields remain unchanged', async () => {
    const service = new ServiceBuilder()
      .withTenantId(TENANT_A)
      .withName('Original')
      .withDurationMinutes(30)
      .withLoyaltyPointsValue(5)
      .build();
    await repo.save(service);

    const result = await useCase.execute({
      id: service.id,
      tenantId: TENANT_A,
      currency: 'BRL',
      locale: 'pt-BR',
      name: 'Novo Nome',
    });

    expect(result.name).toBe('Novo Nome');
    expect(result.durationMinutes).toBe(30);
    expect(result.loyaltyPointsValue).toBe(5);
  });

  it('clears description when description is explicitly null', async () => {
    const service = new ServiceBuilder()
      .withTenantId(TENANT_A)
      .withDescription('Desc original')
      .build();
    await repo.save(service);

    const result = await useCase.execute({
      id: service.id,
      tenantId: TENANT_A,
      currency: 'BRL',
      locale: 'pt-BR',
      description: null,
    });

    expect(result.description).toBeNull();
  });

  it('preserves description when description is omitted from dto', async () => {
    const service = new ServiceBuilder().withTenantId(TENANT_A).withDescription('Mantida').build();
    await repo.save(service);

    const result = await useCase.execute({
      id: service.id,
      tenantId: TENANT_A,
      currency: 'BRL',
      locale: 'pt-BR',
      name: 'Novo Nome',
    });

    expect(result.description).toBe('Mantida');
  });

  it('returns full DTO with pt-BR formatted price', async () => {
    const service = new ServiceBuilder().withTenantId(TENANT_A).build();
    await repo.save(service);

    const result = await useCase.execute({
      id: service.id,
      tenantId: TENANT_A,
      currency: 'BRL',
      locale: 'pt-BR',
      name: 'Lavagem Premium',
    });

    expect(result.price.formatted).toMatch(/^R\$/);
    expect(result.isActive).toBe(true);
  });

  it('throws ServiceNotFoundError when service does not exist', async () => {
    await expect(
      useCase.execute({
        id: 'non-existent-id',
        tenantId: TENANT_A,
        currency: 'BRL',
        locale: 'pt-BR',
        name: 'X',
      }),
    ).rejects.toThrow(ServiceNotFoundError);
  });

  it('throws ServiceNotFoundError when service belongs to a different tenant', async () => {
    const service = new ServiceBuilder().withTenantId(TENANT_B).build();
    await repo.save(service);

    await expect(
      useCase.execute({
        id: service.id,
        tenantId: TENANT_A,
        currency: 'BRL',
        locale: 'pt-BR',
        name: 'X',
      }),
    ).rejects.toThrow(ServiceNotFoundError);
  });

  it('throws ServiceDeactivatedError when updating a deactivated service', async () => {
    const service = new ServiceBuilder().withTenantId(TENANT_A).build();
    service.deactivate();
    await repo.save(service);

    await expect(
      useCase.execute({
        id: service.id,
        tenantId: TENANT_A,
        currency: 'BRL',
        locale: 'pt-BR',
        name: 'X',
      }),
    ).rejects.toThrow(ServiceDeactivatedError);
  });

  it('throws BookingDomainError when updated price is zero', async () => {
    const service = new ServiceBuilder().withTenantId(TENANT_A).build();
    await repo.save(service);

    await expect(
      useCase.execute({
        id: service.id,
        tenantId: TENANT_A,
        currency: 'BRL',
        locale: 'pt-BR',
        priceAmount: 0,
      }),
    ).rejects.toThrow(BookingDomainError);
  });

  it('updates bufferAfterMinutes when provided', async () => {
    const service = new ServiceBuilder().withTenantId(TENANT_A).build();
    await repo.save(service);

    const result = await useCase.execute({
      id: service.id,
      tenantId: TENANT_A,
      currency: 'BRL',
      locale: 'pt-BR',
      bufferAfterMinutes: 15,
    });

    expect(result.bufferAfterMinutes).toBe(15);
  });

  it('rejects a bufferAfterMinutes update when the service has legs', async () => {
    const legs = [
      ServiceLeg.create({
        legIndex: 0,
        name: 'A',
        durationMinutes: 20,
        resourceRequirements: [
          ResourceRequirement.create({ type: ResourceType.ROOM, selectionMode: 'AUTO_ANY' }),
        ],
      }),
      ServiceLeg.create({
        legIndex: 1,
        name: 'B',
        durationMinutes: 20,
        resourceRequirements: [
          ResourceRequirement.create({ type: ResourceType.ROOM, selectionMode: 'AUTO_ANY' }),
        ],
      }),
    ];
    const service = new ServiceBuilder().withTenantId(TENANT_A).withLegs(legs).build();
    await repo.save(service);

    await expect(
      useCase.execute({
        id: service.id,
        tenantId: TENANT_A,
        currency: 'BRL',
        locale: 'pt-BR',
        bufferAfterMinutes: 15,
      }),
    ).rejects.toThrow(BookingServiceHasLegsError);
  });

  it('rejects a bookingModel change once the service has booking history', async () => {
    const service = new ServiceBuilder().withTenantId(TENANT_A).build();
    await repo.save(service);
    const booking = new BookingBuilder()
      .withTenantId(TENANT_A)
      .withLines([new BookingLineBuilder().withServiceId(service.id).build()])
      .build();
    await bookingRepo.save(booking);

    await expect(
      useCase.execute({
        id: service.id,
        tenantId: TENANT_A,
        currency: 'BRL',
        locale: 'pt-BR',
        bookingModel: 'SESSION',
      }),
    ).rejects.toThrow(BookingServiceBookingModelImmutableError);
  });

  it('allows resubmitting the current bookingModel even with booking history (compare-before-validate)', async () => {
    const service = new ServiceBuilder()
      .withTenantId(TENANT_A)
      .withBookingModel('APPOINTMENT')
      .build();
    await repo.save(service);
    const booking = new BookingBuilder()
      .withTenantId(TENANT_A)
      .withLines([new BookingLineBuilder().withServiceId(service.id).build()])
      .build();
    await bookingRepo.save(booking);

    const result = await useCase.execute({
      id: service.id,
      tenantId: TENANT_A,
      currency: 'BRL',
      locale: 'pt-BR',
      bookingModel: 'APPOINTMENT',
    });

    expect(result.bookingModel).toBe('APPOINTMENT');
  });
});
