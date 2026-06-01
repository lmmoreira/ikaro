import {
  GetTenantByIdUseCase,
  GetTenantByIdUseCaseResult,
} from '../../../platform/application/use-cases/get-tenant-by-id.use-case';
import { TenantNotFoundError } from '../../../platform/domain/errors/platform-domain.error';
import { TenantInfoAdapter } from './tenant-info.adapter';

const TENANT_ID = 'aaaaaaaa-0000-4000-8000-000000000001';

const tenantResult: GetTenantByIdUseCaseResult = {
  id: TENANT_ID,
  name: 'Lava Car',
  slug: 'lavacar',
  settings: {
    loyalty: { expiry_days: 180, enable_notifications: true, expiry_warning_days: 7 },
    booking: {
      cancellation_window_hours: 48,
      auto_approve_enabled: false,
      min_booking_advance_hours: 0,
      max_booking_advance_days: 90,
      service_buffer_minutes: 0,
      slot_granularity_minutes: 30,
    },
    business_hours: {
      timezone: 'America/Sao_Paulo',
      monday: { open: '09:00', close: '18:00' },
      tuesday: { open: '09:00', close: '18:00' },
      wednesday: { open: '09:00', close: '18:00' },
      thursday: { open: '09:00', close: '18:00' },
      friday: { open: '09:00', close: '18:00' },
      saturday: { open: '09:00', close: '17:00' },
      sunday: null,
    },
    localization: { currency: 'BRL', currency_symbol: 'R$', language: 'pt-BR', decimal_places: 2 },
    notification: { from_email: null },
  },
};

describe('TenantInfoAdapter', () => {
  let getTenantById: jest.Mocked<Pick<GetTenantByIdUseCase, 'execute'>>;
  let adapter: TenantInfoAdapter;

  beforeEach(() => {
    getTenantById = { execute: jest.fn() };
    adapter = new TenantInfoAdapter(getTenantById as unknown as GetTenantByIdUseCase);
  });

  it('returns tenant info when use case succeeds', async () => {
    getTenantById.execute.mockResolvedValue(tenantResult);

    const result = await adapter.getTenantInfo(TENANT_ID);

    expect(result).toEqual({
      id: TENANT_ID,
      name: 'Lava Car',
      slug: 'lavacar',
      timezone: 'America/Sao_Paulo',
      fromEmail: null,
    });
    expect(getTenantById.execute).toHaveBeenCalledWith(TENANT_ID);
  });

  it('maps fromEmail when notification.from_email is set', async () => {
    const resultWithEmail: GetTenantByIdUseCaseResult = {
      ...tenantResult,
      settings: {
        ...tenantResult.settings,
        notification: { from_email: 'lavagem@beloauto.com.br' },
      },
    };
    getTenantById.execute.mockResolvedValue(resultWithEmail);

    const result = await adapter.getTenantInfo(TENANT_ID);

    expect(result?.fromEmail).toBe('lavagem@beloauto.com.br');
  });

  it('returns null when tenant is not found', async () => {
    getTenantById.execute.mockRejectedValue(new TenantNotFoundError(TENANT_ID));

    const result = await adapter.getTenantInfo(TENANT_ID);

    expect(result).toBeNull();
  });

  it('returns null when any error is thrown', async () => {
    getTenantById.execute.mockRejectedValue(new Error('DB error'));

    const result = await adapter.getTenantInfo(TENANT_ID);

    expect(result).toBeNull();
  });
});
