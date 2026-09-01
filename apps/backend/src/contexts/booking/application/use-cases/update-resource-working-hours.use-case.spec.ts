import { InMemoryTransactionManager } from '../../../../test/infrastructure/in-memory-transaction-manager';
import { InMemoryResourceRepository } from '../../../../test/repositories/booking/in-memory-resource.repository';
import { ResourceBuilder } from '../../../../test/builders/booking/index';
import { FULL_WEEK_BUSINESS_HOURS } from '../../../../test/utils/business-hours-fixtures';
import {
  ResourceNotFoundError,
  ResourceWorkingHoursOutsideTenantHoursError,
} from '../../domain/errors/resource.error';
import { UpdateResourceWorkingHoursUseCase } from './update-resource-working-hours.use-case';

const TENANT_ID = '00000000-0000-7000-8000-000000000001';

describe('UpdateResourceWorkingHoursUseCase', () => {
  let repo: InMemoryResourceRepository;
  let useCase: UpdateResourceWorkingHoursUseCase;

  beforeEach(() => {
    repo = new InMemoryResourceRepository();
    useCase = new UpdateResourceWorkingHoursUseCase(repo, new InMemoryTransactionManager());
  });

  it('updates working hours for an existing resource', async () => {
    const resource = new ResourceBuilder().withTenantId(TENANT_ID).build();
    await repo.save(resource);

    const result = await useCase.execute({
      id: resource.id,
      tenantId: TENANT_ID,
      tenantBusinessHours: FULL_WEEK_BUSINESS_HOURS,
      workingHours: {
        monday: { open: '10:00', close: '16:00' },
        tuesday: null,
        wednesday: null,
        thursday: null,
        friday: null,
        saturday: null,
        sunday: null,
      },
    });

    expect(result.workingHours?.monday).toEqual({ open: '10:00', close: '16:00' });
  });

  it('throws ResourceNotFoundError when the resource does not exist', async () => {
    await expect(
      useCase.execute({
        id: '00000000-0000-4000-8000-000000000099',
        tenantId: TENANT_ID,
        tenantBusinessHours: FULL_WEEK_BUSINESS_HOURS,
        workingHours: null,
      }),
    ).rejects.toThrow(ResourceNotFoundError);
  });

  it('throws ResourceNotFoundError for a cross-tenant resource id', async () => {
    const resource = new ResourceBuilder()
      .withTenantId('99999999-0000-7000-8000-000000000099')
      .build();
    await repo.save(resource);

    await expect(
      useCase.execute({
        id: resource.id,
        tenantId: TENANT_ID,
        tenantBusinessHours: FULL_WEEK_BUSINESS_HOURS,
        workingHours: null,
      }),
    ).rejects.toThrow(ResourceNotFoundError);
  });

  it('rejects working hours outside the tenant business hours', async () => {
    const resource = new ResourceBuilder().withTenantId(TENANT_ID).build();
    await repo.save(resource);

    await expect(
      useCase.execute({
        id: resource.id,
        tenantId: TENANT_ID,
        tenantBusinessHours: FULL_WEEK_BUSINESS_HOURS,
        workingHours: {
          monday: { open: '08:00', close: '18:00' },
          tuesday: null,
          wednesday: null,
          thursday: null,
          friday: null,
          saturday: null,
          sunday: null,
        },
      }),
    ).rejects.toThrow(ResourceWorkingHoursOutsideTenantHoursError);
  });
});
