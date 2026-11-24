import { InternalApiGuard } from '../../../../shared/guards/internal-api.guard';
import { PlatformAdminGuard } from '../../../../shared/guards/platform-admin.guard';
import { SimulationNotApplicableError } from '../../domain/errors/billing-domain.error';
import type {
  SimulateProviderEventUseCase,
  SimulateProviderEventUseCaseResult,
} from '../../application/use-cases/simulate-provider-event.use-case';
import { InternalDevBillingController } from './internal-dev-billing.controller';

const RESULT: SimulateProviderEventUseCaseResult = {
  tenantId: 'tenant-1',
  chargeId: 'charge-1',
  providerChargeId: 'pay_fake_1',
  event: 'PAID_PIX',
  delivery: 'NORMAL',
  outcomes: ['APPLIED'],
};

describe('InternalDevBillingController', () => {
  const execute = jest.fn<
    ReturnType<SimulateProviderEventUseCase['execute']>,
    Parameters<SimulateProviderEventUseCase['execute']>
  >();
  const controller = new InternalDevBillingController({
    execute,
  } as unknown as SimulateProviderEventUseCase);

  beforeEach(() => execute.mockReset());

  it('hands the body and the correlation id to the use case and returns its result', async () => {
    execute.mockResolvedValue(RESULT);

    const result = await controller.simulateEvent(
      { tenantId: 'tenant-1', event: 'PAID_PIX', delivery: 'DUPLICATE', failure: 'PROVIDER_5XX' },
      'corr-1',
    );

    expect(result).toBe(RESULT);
    expect(execute).toHaveBeenCalledWith({
      tenantId: 'tenant-1',
      chargeId: undefined,
      event: 'PAID_PIX',
      delivery: 'DUPLICATE',
      failure: 'PROVIDER_5XX',
      correlationId: 'corr-1',
    });
  });

  it('answers 409 through the billing error mapper when the event does not apply', async () => {
    execute.mockRejectedValue(new SimulationNotApplicableError('CHARGE_STATE', 'does not apply'));

    await expect(
      controller.simulateEvent(
        { chargeId: 'charge-1', event: 'REFUND_FULL', delivery: 'NORMAL' },
        'c',
      ),
    ).rejects.toMatchObject({ status: 409 });
  });

  it('rethrows an unexpected error untouched', async () => {
    execute.mockRejectedValue(new Error('boom'));

    await expect(
      controller.simulateEvent(
        { chargeId: 'charge-1', event: 'PAID_PIX', delivery: 'NORMAL' },
        'c',
      ),
    ).rejects.toThrow('boom');
  });

  it('carries both operator-key guards, and the gate and suspension annotations', () => {
    expect(Reflect.getMetadata('__guards__', InternalDevBillingController)).toEqual([
      InternalApiGuard,
      PlatformAdminGuard,
    ]);
  });
});
