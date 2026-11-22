import { ProviderHealthBuilder } from '../../../../test/builders/billing';
import { createReconcileHarness } from '../../../../test/infrastructure/billing-reconcile-harness';

const KEY = 'BRL_FAKE';
const AT = new Date('2026-03-10T15:00:00Z');

describe('RecordReconcilePassUseCase (UC-116)', () => {
  let h: ReturnType<typeof createReconcileHarness>;

  beforeEach(() => {
    h = createReconcileHarness();
  });

  const record = (input: { fullPass?: boolean; providerReadSucceeded?: boolean } = {}) =>
    h.recordPass.execute({
      merchantProfileKey: KEY,
      at: AT,
      fullPass: input.fullPass ?? false,
      providerReadSucceeded: input.providerReadSucceeded ?? true,
    });

  it('a read that already succeeded stamps the account without asking the provider again', async () => {
    const health = jest.spyOn(h.provider, 'readAccountHealth');

    await record();

    expect(health).not.toHaveBeenCalled();
    expect((await h.health.findByKey(KEY))?.lastReconcileOkAt).toEqual(AT);
  });

  it('with no read yet it proves the provider answers first, then stamps', async () => {
    const health = jest.spyOn(h.provider, 'readAccountHealth');

    await record({ providerReadSucceeded: false });

    expect(health).toHaveBeenCalledWith(KEY);
    expect((await h.health.findByKey(KEY))?.lastReconcileOkAt).toEqual(AT);
  });

  it('with no read yet and the provider down it fails and stamps nothing', async () => {
    h.provider.failNextCall('UNAVAILABLE');

    await expect(record({ providerReadSucceeded: false })).rejects.toBeDefined();

    expect(await h.health.findByKey(KEY)).toBeNull();
  });

  it('only a full pass stamps last_full_reconcile_at', async () => {
    await record({ fullPass: false });
    expect((await h.health.findByKey(KEY))?.lastFullReconcileAt).toBeNull();

    await record({ fullPass: true });
    expect((await h.health.findByKey(KEY))?.lastFullReconcileAt).toEqual(AT);
  });

  it('never touches the freeze or the webhook status another writer set', async () => {
    const since = new Date('2026-03-10T10:00:00Z');
    await h.health.save(
      new ProviderHealthBuilder()
        .withMerchantProfileKey(KEY)
        .withFreeze(since)
        .withWebhookStatus('PAUSED')
        .build(),
    );

    await record({ fullPass: true });

    expect(await h.health.findByKey(KEY)).toMatchObject({
      freezeActive: true,
      freezeSince: since,
      webhookStatus: 'PAUSED',
    });
  });
});
