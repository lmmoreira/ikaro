import { ReconcileOneChargeUseCase } from './reconcile-one-charge.use-case';
import type { ChargeProviderSyncService } from '../services/charge-provider-sync.service';

describe('ReconcileOneChargeUseCase', () => {
  const input = { tenantId: 'tenant-1', chargeId: 'charge-1', correlationId: 'corr-1' };

  it('reads and applies one charge through the shared sync service and returns what it did', async () => {
    const sync = {
      sync: jest.fn().mockResolvedValue({ outcome: 'APPLIED', merchantProfileKey: 'BRL_FAKE' }),
    } as unknown as jest.Mocked<ChargeProviderSyncService>;

    const result = await new ReconcileOneChargeUseCase(sync).execute(input);

    expect(sync.sync).toHaveBeenCalledWith(input);
    expect(result).toEqual({ outcome: 'APPLIED', merchantProfileKey: 'BRL_FAKE' });
  });

  it('a failed read propagates, so the job can count that charge and go on with the others', async () => {
    const sync = {
      sync: jest.fn().mockRejectedValue(new Error('provider down')),
    } as unknown as jest.Mocked<ChargeProviderSyncService>;

    await expect(new ReconcileOneChargeUseCase(sync).execute(input)).rejects.toThrow(
      'provider down',
    );
  });
});
