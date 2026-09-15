import { InMemoryBookingPlatformPort } from '../../../../test/infrastructure/in-memory-booking-platform.port';
import { InMemoryTransactionManager } from '../../../../test/infrastructure/in-memory-transaction-manager';
import { InMemoryResourceRepository } from '../../../../test/repositories/booking/in-memory-resource.repository';
import { InMemoryServiceRepository } from '../../../../test/repositories/booking/in-memory-service.repository';
import { ResourceBuilder } from '../../../../test/builders/booking/index';
import {
  BookingDomainError,
  BookingServiceResourceTypeUnavailableError,
  ClassResourceSlotResourceNotActiveError,
} from '../../domain/errors/booking-domain.error';
import { ResourceType } from '../../domain/resource.types';
import { CreateServiceUseCase } from './create-service.use-case';

const TENANT_A = '10000000-0000-4000-8000-000000000001';
const TENANT_B = '10000000-0000-4000-8000-000000000002';

const ctx = {
  tenantId: TENANT_A,
  currency: 'BRL',
  locale: 'pt-BR',
  tenantServiceBufferMinutes: 60,
};

const baseDto = {
  name: 'Lavagem Completa',
  description: 'Lavagem exterior e interior',
  priceAmount: 150,
  durationMinutes: 60,
  loyaltyPointsValue: 10,
  requiresPickupAddress: false,
};

describe('CreateServiceUseCase', () => {
  let repo: InMemoryServiceRepository;
  let resourceRepo: InMemoryResourceRepository;
  let bookingPlatform: InMemoryBookingPlatformPort;
  let useCase: CreateServiceUseCase;

  beforeEach(() => {
    repo = new InMemoryServiceRepository();
    resourceRepo = new InMemoryResourceRepository();
    bookingPlatform = new InMemoryBookingPlatformPort();
    useCase = new CreateServiceUseCase(
      repo,
      resourceRepo,
      bookingPlatform,
      new InMemoryTransactionManager(),
    );
  });

  it('revalidates the public pages for the service tenant', async () => {
    await useCase.execute({ ...baseDto, ...ctx });

    expect(bookingPlatform.revalidatedTenantIds).toEqual([TENANT_A]);
  });

  it('creates a service and returns the full result DTO', async () => {
    const result = await useCase.execute({ ...baseDto, ...ctx });

    expect(result.id).toBeDefined();
    expect(result.name).toBe('Lavagem Completa');
    expect(result.description).toBe('Lavagem exterior e interior');
    expect(result.price.amount).toBe(150);
    expect(result.price.currency).toBe('BRL');
    expect(result.price.formatted).toBe('R$ 150,00');
    expect(result.durationMinutes).toBe(60);
    expect(result.loyaltyPointsValue).toBe(10);
    expect(result.requiresPickupAddress).toBe(false);
    expect(result.isActive).toBe(true);
    expect(result.createdAt).toBeDefined();
  });

  it('persists the service scoped to tenantId', async () => {
    const result = await useCase.execute({ ...baseDto, ...ctx });

    const saved = await repo.findById(result.id, TENANT_A);
    expect(saved).not.toBeNull();
    expect(saved!.tenantId).toBe(TENANT_A);
  });

  it('service is not visible to a different tenant', async () => {
    const result = await useCase.execute({ ...baseDto, ...ctx });

    const fromOtherTenant = await repo.findById(result.id, TENANT_B);
    expect(fromOtherTenant).toBeNull();
  });

  it('defaults requiresPickupAddress to false when omitted', async () => {
    const result = await useCase.execute({
      name: baseDto.name,
      priceAmount: baseDto.priceAmount,
      durationMinutes: baseDto.durationMinutes,
      loyaltyPointsValue: baseDto.loyaltyPointsValue,
      ...ctx,
    });
    expect(result.requiresPickupAddress).toBe(false);
  });

  it('allows loyaltyPointsValue of zero', async () => {
    const result = await useCase.execute({ ...baseDto, loyaltyPointsValue: 0, ...ctx });
    expect(result.loyaltyPointsValue).toBe(0);
  });

  it('creates an inactive service when isActive=false is requested', async () => {
    const result = await useCase.execute({ ...baseDto, isActive: false, ...ctx });
    expect(result.isActive).toBe(false);
  });

  it('throws BookingDomainError when priceAmount is zero', async () => {
    await expect(useCase.execute({ ...baseDto, priceAmount: 0, ...ctx })).rejects.toThrow(
      BookingDomainError,
    );
  });

  it('throws BookingDomainError when durationMinutes is zero', async () => {
    await expect(useCase.execute({ ...baseDto, durationMinutes: 0, ...ctx })).rejects.toThrow(
      BookingDomainError,
    );
  });

  it('throws BookingDomainError when loyaltyPointsValue is negative', async () => {
    await expect(useCase.execute({ ...baseDto, loyaltyPointsValue: -1, ...ctx })).rejects.toThrow(
      BookingDomainError,
    );
  });

  it('defaults bookingModel to APPOINTMENT', async () => {
    const result = await useCase.execute({ ...baseDto, ...ctx });
    expect(result.bookingModel).toBe('APPOINTMENT');
  });

  it('snapshots bufferAfterMinutes from the tenant default at creation (UC-053 step 1)', async () => {
    const result = await useCase.execute({ ...baseDto, ...ctx, tenantServiceBufferMinutes: 45 });
    expect(result.bufferAfterMinutes).toBe(45);
  });

  it('creates a SESSION service with classResourceSlots and a null bufferAfterMinutes', async () => {
    const room = new ResourceBuilder().withTenantId(TENANT_A).withType(ResourceType.ROOM).build();
    await resourceRepo.save(room);

    const result = await useCase.execute({
      ...baseDto,
      ...ctx,
      bookingModel: 'SESSION',
      classResourceSlots: [{ type: 'ROOM', eligibleResourceIds: [room.id] }],
    });
    expect(result.bookingModel).toBe('SESSION');
    expect(result.bufferAfterMinutes).toBeNull();
    expect(result.classResourceSlots).toEqual([{ type: 'ROOM', eligibleResourceIds: [room.id] }]);
  });

  it('rejects a classResourceSlots type with no active resources', async () => {
    await expect(
      useCase.execute({
        ...baseDto,
        ...ctx,
        bookingModel: 'SESSION',
        // No ROOM resource exists for this tenant at all — rejected regardless of which ID is
        // listed here (the type-availability check runs before the per-ID membership check).
        classResourceSlots: [
          { type: 'ROOM', eligibleResourceIds: ['00000000-0000-4000-8000-999999999998'] },
        ],
      }),
    ).rejects.toThrow(BookingServiceResourceTypeUnavailableError);
  });

  it('rejects a classResourceSlots eligibleResourceIds entry that is not an active resource of the tenant', async () => {
    const room = new ResourceBuilder().withTenantId(TENANT_A).withType(ResourceType.ROOM).build();
    await resourceRepo.save(room);

    await expect(
      useCase.execute({
        ...baseDto,
        ...ctx,
        bookingModel: 'SESSION',
        classResourceSlots: [
          { type: 'ROOM', eligibleResourceIds: ['00000000-0000-4000-8000-999999999999'] },
        ],
      }),
    ).rejects.toThrow(ClassResourceSlotResourceNotActiveError);
  });

  it('starts with an empty resourceRequirements array and null legs', async () => {
    const result = await useCase.execute({ ...baseDto, ...ctx });
    expect(result.resourceRequirements).toEqual([]);
    expect(result.legs).toBeNull();
  });
});
