import { ProviderEventBuilder, ProviderHealthBuilder } from '../../../../test/builders/billing';
import {
  createSelfHealHarness,
  SWEEP_NOW,
} from '../../../../test/infrastructure/billing-self-heal-harness';

const KEY = 'BRL_FAKE';
const secondsAfter = (from: Date, seconds: number): Date =>
  new Date(from.getTime() + seconds * 1000);

describe('CheckProviderHealthUseCase (UC-140 step 2)', () => {
  let h: ReturnType<typeof createSelfHealHarness>;

  beforeEach(() => {
    h = createSelfHealHarness();
  });

  const check = () =>
    h.checkHealth.execute({ merchantProfileKey: KEY, now: h.clock.now(), correlationId: 'corr-1' });

  it('records a healthy account: webhook OK, counter 0, and no alert', async () => {
    const result = await check();

    expect(result).toMatchObject({ readOk: true, webhookAlert: 'NONE', reenableAttempted: false });
    expect(await h.health.findByKey(KEY)).toMatchObject({
      webhookStatus: 'OK',
      healthReadFailures: 0,
    });
  });

  it('re-enables a paused queue once, keeps the alert raised and stamps the re-enable instant', async () => {
    h.provider.pauseWebhookQueue();
    const reenable = jest.spyOn(h.provider, 'reenableWebhookQueue');

    const result = await check();

    expect(reenable).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ webhookAlert: 'RAISED', reenableAttempted: true });
    expect(await h.health.findByKey(KEY)).toMatchObject({
      webhookStatus: 'PAUSED',
      updatedAt: h.clock.now(),
    });
  });

  it('a cleared provider flag alone does not close the alert (no delivery after the re-enable)', async () => {
    h.provider.pauseWebhookQueue();
    await check();
    h.clock.advanceMs(3_600_000);

    const result = await check();

    expect(result.webhookAlert).toBe('RAISED');
    expect((await h.health.findByKey(KEY))?.webhookStatus).toBe('PAUSED');
  });

  it('an unprocessed-looking older delivery (received before the re-enable) leaves it raised', async () => {
    h.provider.pauseWebhookQueue();
    await check();
    const reenabledAt = (await h.health.findByKey(KEY))!.updatedAt;
    await h.providerEvents.insertIfAbsent(
      new ProviderEventBuilder().withReceivedAt(new Date(reenabledAt.getTime() - 1000)).build(),
    );
    h.clock.advanceMs(3_600_000);

    expect((await check()).webhookAlert).toBe('RAISED');
  });

  it('a processed delivery received after the re-enable closes the alert', async () => {
    h.provider.pauseWebhookQueue();
    await check();
    const reenabledAt = (await h.health.findByKey(KEY))!.updatedAt;
    await h.providerEvents.insertIfAbsent(
      new ProviderEventBuilder().withReceivedAt(secondsAfter(reenabledAt, 5)).build(),
    );
    h.clock.advanceMs(3_600_000);

    const result = await check();

    expect(result.webhookAlert).toBe('CLOSED');
    expect((await h.health.findByKey(KEY))?.webhookStatus).toBe('OK');
  });

  it('a provider still paused after a failed re-enable keeps the alert raised, with the failure logged not thrown', async () => {
    h.provider.pauseWebhookQueue();
    jest.spyOn(h.provider, 'reenableWebhookQueue').mockRejectedValueOnce(new Error('401'));

    const result = await check();

    expect(result).toMatchObject({
      webhookAlert: 'RAISED',
      reenableAttempted: true,
      reenableFailed: true,
    });
    expect((await h.health.findByKey(KEY))?.webhookStatus).toBe('PAUSED');
  });

  it('a failed health read counts toward the freeze and leaves the webhook state alone', async () => {
    await h.health.save(
      new ProviderHealthBuilder().withMerchantProfileKey(KEY).withWebhookStatus('PAUSED').build(),
    );
    h.provider.failNextCall('UNAVAILABLE');

    const result = await check();

    expect(result).toMatchObject({ readOk: false });
    expect(await h.health.findByKey(KEY)).toMatchObject({
      healthReadFailures: 1,
      webhookStatus: 'PAUSED',
    });
  });

  it('two failed reads in a row count 2, and a success in between resets the counter to 0', async () => {
    h.provider.failNextCall('UNAVAILABLE');
    await check();
    h.provider.failNextCall('UNAVAILABLE');
    await check();
    expect((await h.health.findByKey(KEY))?.healthReadFailures).toBe(2);

    await check();
    expect((await h.health.findByKey(KEY))?.healthReadFailures).toBe(0);
    h.provider.failNextCall('UNAVAILABLE');
    await check();
    expect((await h.health.findByKey(KEY))?.healthReadFailures).toBe(1);
  });

  it('a plain read never moves the re-enable instant', async () => {
    const stamped = new Date(SWEEP_NOW.getTime() - 5 * 3_600_000);
    await h.health.save(
      new ProviderHealthBuilder().withMerchantProfileKey(KEY).withUpdatedAt(stamped).build(),
    );

    await check();

    expect((await h.health.findByKey(KEY))?.updatedAt).toEqual(stamped);
  });
});
