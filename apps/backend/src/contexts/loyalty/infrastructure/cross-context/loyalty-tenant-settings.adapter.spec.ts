import { GetTenantByIdUseCase } from '../../../platform/application/use-cases/get-tenant-by-id.use-case';
import { TenantNotFoundError } from '../../../platform/domain/errors/platform-domain.error';
import { LoyaltyTenantSettingsAdapter } from './loyalty-tenant-settings.adapter';

const TENANT_ID = '00000000-0000-7000-8000-000000000001';

function makeResult(expiryDays: number) {
  return {
    id: TENANT_ID,
    slug: 'test-tenant',
    name: 'Test Tenant',
    settings: {
      loyalty: { expiry_days: expiryDays, expiry_warning_days: 7 },
      business_hours: {
        timezone: 'America/Sao_Paulo',
        monday: null,
        tuesday: null,
        wednesday: null,
        thursday: null,
        friday: null,
        saturday: null,
        sunday: null,
      },
      booking: { cancellation_window_hours: 48, allow_guest_booking: true, max_advance_days: 60 },
    },
  };
}

describe('LoyaltyTenantSettingsAdapter', () => {
  let adapter: LoyaltyTenantSettingsAdapter;
  let useCase: jest.Mocked<GetTenantByIdUseCase>;

  beforeEach(() => {
    useCase = { execute: jest.fn() } as unknown as jest.Mocked<GetTenantByIdUseCase>;
    adapter = new LoyaltyTenantSettingsAdapter(useCase);
  });

  it('returns expiryDays from tenant settings', async () => {
    useCase.execute.mockResolvedValue(makeResult(90) as never);
    const result = await adapter.getLoyaltySettings(TENANT_ID);
    expect(result.expiryDays).toBe(90);
  });

  it('falls back to 180 days when tenant is not found', async () => {
    useCase.execute.mockRejectedValue(new TenantNotFoundError(TENANT_ID));
    const result = await adapter.getLoyaltySettings(TENANT_ID);
    expect(result.expiryDays).toBe(180);
  });

  it('falls back to 180 days on any error', async () => {
    useCase.execute.mockRejectedValue(new Error('db down'));
    const result = await adapter.getLoyaltySettings(TENANT_ID);
    expect(result.expiryDays).toBe(180);
  });
});
