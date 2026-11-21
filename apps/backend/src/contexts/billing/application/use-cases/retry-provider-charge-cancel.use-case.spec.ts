import type { ProviderChargeCancellationService } from '../services/provider-charge-cancellation.service';
import { RetryProviderChargeCancelUseCase } from './retry-provider-charge-cancel.use-case';

describe('RetryProviderChargeCancelUseCase', () => {
  it('retries the one charge through the shared cancellation service, in its own tenant', async () => {
    const result = { cancelled: 1, paid: 0, leftFlagged: 0, skipped: 0 };
    const cancellation = {
      execute: jest.fn().mockResolvedValue(result),
    } as unknown as jest.Mocked<ProviderChargeCancellationService>;

    const outcome = await new RetryProviderChargeCancelUseCase(cancellation).execute({
      tenantId: 'tenant-1',
      chargeId: 'charge-1',
      correlationId: 'corr-1',
    });

    expect(cancellation.execute).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      chargeIds: ['charge-1'],
      correlationId: 'corr-1',
    });
    expect(outcome).toBe(result);
  });
});
