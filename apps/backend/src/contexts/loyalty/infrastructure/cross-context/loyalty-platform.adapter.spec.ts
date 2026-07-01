import { GetTenantByIdUseCase } from '../../../platform/application/use-cases/get-tenant-by-id.use-case';
import { TenantNotFoundError } from '../../../platform/domain/errors/platform-domain.error';
import { TenantBuilder } from '../../../../test/builders/platform/tenant.builder';
import { LoyaltyPlatformAdapter } from './loyalty-platform.adapter';

const TENANT_ID = 'aaaaaaaa-0000-4000-8000-000000000001';

function makeTenantResult(
  overrides: {
    expiryDays?: number;
    notificationMinPoints?: number;
    pointsPerCurrencyUnit?: number;
  } = {},
) {
  const tenant = new TenantBuilder().build();
  return {
    id: tenant.id,
    slug: tenant.slug.value,
    name: tenant.name,
    locale: tenant.settings.localization.language,
    settings: {
      ...tenant.settings.toJSON(),
      loyalty: {
        ...tenant.settings.toJSON().loyalty,
        expiryDays: overrides.expiryDays ?? 365,
        notificationMinPoints: overrides.notificationMinPoints ?? 100,
        pointsPerCurrencyUnit: overrides.pointsPerCurrencyUnit ?? 10,
      },
    },
  };
}

describe('LoyaltyPlatformAdapter', () => {
  let getTenantById: jest.Mocked<Pick<GetTenantByIdUseCase, 'execute'>>;
  let adapter: LoyaltyPlatformAdapter;

  beforeEach(() => {
    getTenantById = { execute: jest.fn() };
    adapter = new LoyaltyPlatformAdapter(getTenantById as unknown as GetTenantByIdUseCase);
  });

  afterEach(() => jest.resetAllMocks());

  it('returns loyalty settings from tenant', async () => {
    getTenantById.execute.mockResolvedValue(
      makeTenantResult({ expiryDays: 90, notificationMinPoints: 20, pointsPerCurrencyUnit: 10 }),
    );

    const result = await adapter.getLoyaltySettings(TENANT_ID);

    expect(result).toEqual({
      expiryDays: 90,
      notificationMinPoints: 20,
      pointsPerCurrencyUnit: 10,
    });
    expect(getTenantById.execute).toHaveBeenCalledWith({ tenantId: TENANT_ID });
  });

  it('returns defaults when tenant is not found', async () => {
    getTenantById.execute.mockRejectedValue(new TenantNotFoundError(TENANT_ID));

    const result = await adapter.getLoyaltySettings(TENANT_ID);

    expect(result).toEqual({
      expiryDays: 180,
      notificationMinPoints: 50,
      pointsPerCurrencyUnit: 0,
    });
  });
});
