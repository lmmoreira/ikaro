import { InMemoryEventBus } from '../../../../test/infrastructure/in-memory-event-bus';
import { CronLoyaltyController } from './cron-loyalty.controller';

describe('CronLoyaltyController', () => {
  let controller: CronLoyaltyController;
  let triggerBus: InMemoryEventBus;

  beforeEach(() => {
    triggerBus = new InMemoryEventBus();
    controller = new CronLoyaltyController(triggerBus);
  });

  describe('POST /cron/loyalty-expiry', () => {
    it('returns { ok: true }', async () => {
      const result = await controller.runExpiry();
      expect(result).toEqual({ ok: true });
    });

    it('publishes the cron-loyalty-expiry trigger', async () => {
      await controller.runExpiry();
      expect(triggerBus.publishedTriggers).toEqual(['cron-loyalty-expiry']);
    });
  });

  describe('POST /cron/loyalty-expiry-warning', () => {
    it('returns { ok: true }', async () => {
      const result = await controller.runExpiryWarning();
      expect(result).toEqual({ ok: true });
    });

    it('publishes the cron-loyalty-expiry-warning trigger', async () => {
      await controller.runExpiryWarning();
      expect(triggerBus.publishedTriggers).toEqual(['cron-loyalty-expiry-warning']);
    });
  });
});
