import { GetTenantByIdUseCase } from '../../../platform/application/use-cases/get-tenant-by-id.use-case';
import { TenantNotFoundError } from '../../../platform/domain/errors/platform-domain.error';
import { TenantBuilder } from '../../../../test/builders/platform/tenant.builder';
import { NotificationPlatformAdapter } from './notification-platform.adapter';

const TENANT_ID = 'aaaaaaaa-0000-4000-8000-000000000001';

function makeTenantResult(fromEmail: string | null = 'no-reply@example.com') {
  const tenant = new TenantBuilder().build();
  const settings = tenant.settings.toJSON();
  return {
    id: tenant.id,
    slug: tenant.slug.value,
    name: tenant.name,
    settings: {
      ...settings,
      notification: { fromEmail: fromEmail },
    },
  };
}

describe('NotificationPlatformAdapter', () => {
  let getTenantById: jest.Mocked<Pick<GetTenantByIdUseCase, 'execute'>>;
  let adapter: NotificationPlatformAdapter;

  beforeEach(() => {
    getTenantById = { execute: jest.fn() };
    adapter = new NotificationPlatformAdapter(getTenantById as unknown as GetTenantByIdUseCase);
  });

  afterEach(() => jest.resetAllMocks());

  it('returns tenant info when tenant exists', async () => {
    const tenantResult = makeTenantResult('hello@ikaro.example');
    getTenantById.execute.mockResolvedValue(tenantResult);

    const result = await adapter.getTenantInfo(TENANT_ID);

    expect(result).toEqual({
      id: tenantResult.id,
      name: tenantResult.name,
      slug: tenantResult.slug,
      timezone: tenantResult.settings.businessHours.timezone,
      locale: tenantResult.settings.localization.language,
      fromEmail: 'hello@ikaro.example',
    });
    expect(getTenantById.execute).toHaveBeenCalledWith(TENANT_ID);
  });

  it('returns null fromEmail when fromEmail is null', async () => {
    const tenantResult = makeTenantResult(null);
    getTenantById.execute.mockResolvedValue(tenantResult);

    const result = await adapter.getTenantInfo(TENANT_ID);

    expect(result?.fromEmail).toBeNull();
  });

  it('returns null when tenant is not found', async () => {
    getTenantById.execute.mockRejectedValue(new TenantNotFoundError(TENANT_ID));

    const result = await adapter.getTenantInfo(TENANT_ID);

    expect(result).toBeNull();
  });
});
