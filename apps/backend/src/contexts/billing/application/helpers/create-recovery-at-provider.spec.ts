import { AppLogger } from '../../../../shared/observability/app-logger';
import { createRecoveryChargeAtProvider } from './create-recovery-at-provider';

describe('createRecoveryChargeAtProvider', () => {
  const command = { tenantId: 'tenant-1', chargeId: 'charge-1', correlationId: 'corr-1' };

  it('asks the creation service to make the charge payable, with the caller’s correlation id', async () => {
    const execute = jest.fn().mockResolvedValue('READY');

    await createRecoveryChargeAtProvider({ execute }, new AppLogger('test'), command);

    expect(execute).toHaveBeenCalledWith(command);
  });

  it('never throws: a failing creation is logged and the charge is left for the retry', async () => {
    const logger = new AppLogger('test');
    const logged = jest.spyOn(logger, 'error').mockImplementation();
    const execute = jest.fn().mockRejectedValue(new Error('provider down'));

    await expect(
      createRecoveryChargeAtProvider({ execute }, logger, command),
    ).resolves.toBeUndefined();

    expect(logged).toHaveBeenCalledWith(
      expect.stringContaining('billing_recovery_creation_failed'),
      expect.stringContaining('provider down'),
      { tenantId: 'tenant-1', chargeId: 'charge-1' },
    );
  });
});
