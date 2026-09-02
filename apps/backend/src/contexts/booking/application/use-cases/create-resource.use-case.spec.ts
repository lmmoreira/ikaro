import { InMemoryTransactionManager } from '../../../../test/infrastructure/in-memory-transaction-manager';
import { InMemoryBookingStaffPort } from '../../../../test/infrastructure/in-memory-booking-staff.port';
import { InMemoryResourceRepository } from '../../../../test/repositories/booking/in-memory-resource.repository';
import { ResourceBuilder } from '../../../../test/builders/booking/index';
import {
  FULL_WEEK_BUSINESS_HOURS,
  EMPTY_BUSINESS_HOURS,
} from '../../../../test/utils/business-hours-fixtures';
import {
  ResourceMaxCapacityInvalidError,
  ResourceNoWorkingHoursError,
  ResourceStaffAlreadyWrappedError,
  ResourceStaffNotFoundError,
  ResourceTypeNotCreatableError,
  ResourceTypeRefIdMismatchError,
} from '../../domain/errors/resource.error';
import { ResourceType } from '../../domain/resource.types';
import { CreateResourceUseCase } from './create-resource.use-case';

const TENANT_ID = '00000000-0000-7000-8000-000000000001';
const STAFF_ID = '00000000-0000-7000-8000-000000000002';

describe('CreateResourceUseCase', () => {
  let repo: InMemoryResourceRepository;
  let staffPort: InMemoryBookingStaffPort;
  let useCase: CreateResourceUseCase;

  beforeEach(() => {
    repo = new InMemoryResourceRepository();
    staffPort = new InMemoryBookingStaffPort();
    useCase = new CreateResourceUseCase(repo, staffPort, new InMemoryTransactionManager());
  });

  it('creates a ROOM resource', async () => {
    const result = await useCase.execute({
      tenantId: TENANT_ID,
      type: ResourceType.ROOM,
      name: 'Estúdio 1',
      tenantBusinessHours: FULL_WEEK_BUSINESS_HOURS,
      maxCapacity: 12,
    });

    expect(result.id).toBeDefined();
    expect(result.type).toBe(ResourceType.ROOM);
    expect(result.maxCapacity).toBe(12);
    expect(result.isActive).toBe(true);
  });

  it('creates a STAFF resource wrapping an existing active staff member', async () => {
    staffPort.setProfile(STAFF_ID, { id: STAFF_ID, isActive: true });

    const result = await useCase.execute({
      tenantId: TENANT_ID,
      type: ResourceType.STAFF,
      refId: STAFF_ID,
      name: 'Camila Duarte',
      tenantBusinessHours: FULL_WEEK_BUSINESS_HOURS,
    });

    expect(result.type).toBe(ResourceType.STAFF);
    expect(result.refId).toBe(STAFF_ID);
  });

  it('throws ResourceStaffNotFoundError when the staff member does not exist/is inactive', async () => {
    await expect(
      useCase.execute({
        tenantId: TENANT_ID,
        type: ResourceType.STAFF,
        refId: STAFF_ID,
        name: 'Camila Duarte',
        tenantBusinessHours: FULL_WEEK_BUSINESS_HOURS,
      }),
    ).rejects.toThrow(ResourceStaffNotFoundError);
  });

  it('throws ResourceStaffAlreadyWrappedError on a duplicate staff wrap', async () => {
    staffPort.setProfile(STAFF_ID, { id: STAFF_ID, isActive: true });
    await repo.save(
      new ResourceBuilder()
        .withTenantId(TENANT_ID)
        .withType(ResourceType.STAFF)
        .withRefId(STAFF_ID)
        .build(),
    );

    await expect(
      useCase.execute({
        tenantId: TENANT_ID,
        type: ResourceType.STAFF,
        refId: STAFF_ID,
        name: 'Camila Duarte (again)',
        tenantBusinessHours: FULL_WEEK_BUSINESS_HOURS,
      }),
    ).rejects.toThrow(ResourceStaffAlreadyWrappedError);
  });

  it('throws ResourceNoWorkingHoursError when neither the resource nor the tenant has hours', async () => {
    await expect(
      useCase.execute({
        tenantId: TENANT_ID,
        type: ResourceType.ROOM,
        name: 'Estúdio 1',
        tenantBusinessHours: EMPTY_BUSINESS_HOURS,
      }),
    ).rejects.toThrow(ResourceNoWorkingHoursError);
  });

  it('throws ResourceTypeRefIdMismatchError when type=STAFF has no refId', async () => {
    await expect(
      useCase.execute({
        tenantId: TENANT_ID,
        type: ResourceType.STAFF,
        name: 'Camila Duarte',
        tenantBusinessHours: FULL_WEEK_BUSINESS_HOURS,
      }),
    ).rejects.toThrow(ResourceTypeRefIdMismatchError);
  });

  it('throws ResourceTypeNotCreatableError when type=LOCATION', async () => {
    await expect(
      useCase.execute({
        tenantId: TENANT_ID,
        type: ResourceType.LOCATION,
        name: 'Unidade Única',
        tenantBusinessHours: FULL_WEEK_BUSINESS_HOURS,
      }),
    ).rejects.toThrow(ResourceTypeNotCreatableError);
  });

  it('throws ResourceMaxCapacityInvalidError when maxCapacity <= 0', async () => {
    await expect(
      useCase.execute({
        tenantId: TENANT_ID,
        type: ResourceType.ROOM,
        name: 'Estúdio 1',
        tenantBusinessHours: FULL_WEEK_BUSINESS_HOURS,
        maxCapacity: 0,
      }),
    ).rejects.toThrow(ResourceMaxCapacityInvalidError);
  });

  it('persists the resource to the repository', async () => {
    const result = await useCase.execute({
      tenantId: TENANT_ID,
      type: ResourceType.EQUIPMENT,
      name: 'Máquina de lavar 1',
      tenantBusinessHours: FULL_WEEK_BUSINESS_HOURS,
    });

    const stored = await repo.findById(result.id, TENANT_ID);
    expect(stored).not.toBeNull();
    expect(stored!.name).toBe('Máquina de lavar 1');
  });

  it('does not check staff wraps from another tenant', async () => {
    staffPort.setProfile(STAFF_ID, { id: STAFF_ID, isActive: true });
    await repo.save(
      new ResourceBuilder()
        .withTenantId('99999999-0000-7000-8000-000000000099')
        .withType(ResourceType.STAFF)
        .withRefId(STAFF_ID)
        .build(),
    );

    const result = await useCase.execute({
      tenantId: TENANT_ID,
      type: ResourceType.STAFF,
      refId: STAFF_ID,
      name: 'Camila Duarte',
      tenantBusinessHours: FULL_WEEK_BUSINESS_HOURS,
    });

    expect(result.id).toBeDefined();
  });
});
