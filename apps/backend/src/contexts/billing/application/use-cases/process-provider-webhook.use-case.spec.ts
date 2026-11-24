import { ProcessProviderWebhookUseCase } from './process-provider-webhook.use-case';

describe('ProcessProviderWebhookUseCase', () => {
  it('runs the webhook processor and returns its outcome, untouched', async () => {
    const input = {
      provider: 'ASAAS',
      rawBody: '{}',
      headers: {},
      correlationId: 'corr-1',
    } as const;
    const execute = jest.fn().mockResolvedValue('APPLIED');
    const useCase = new ProcessProviderWebhookUseCase({ execute });

    await expect(useCase.execute(input)).resolves.toBe('APPLIED');
    expect(execute).toHaveBeenCalledWith(input);
  });

  it("lets the processor's error through so the provider retries", async () => {
    const useCase = new ProcessProviderWebhookUseCase({
      execute: jest.fn().mockRejectedValue(new Error('provider re-read failed')),
    });

    await expect(
      useCase.execute({ provider: 'ASAAS', rawBody: '{}', headers: {}, correlationId: 'c' }),
    ).rejects.toThrow('provider re-read failed');
  });
});
