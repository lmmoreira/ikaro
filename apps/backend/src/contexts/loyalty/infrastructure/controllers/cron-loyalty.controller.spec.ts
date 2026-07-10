import { InMemoryEventBus } from '../../../../test/infrastructure/in-memory-event-bus';
import {
  CRON_LOYALTY_EXPIRY_TRIGGER,
  CRON_LOYALTY_EXPIRY_WARNING_TRIGGER,
} from '../events/cron-trigger-names.constants';
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
      expect(triggerBus.publishedTriggers).toEqual([CRON_LOYALTY_EXPIRY_TRIGGER]);
    });
  });

  describe('POST /cron/loyalty-expiry-warning', () => {
    it('returns { ok: true }', async () => {
      const result = await controller.runExpiryWarning();
      expect(result).toEqual({ ok: true });
    });

    it('publishes the cron-loyalty-expiry-warning trigger', async () => {
      await controller.runExpiryWarning();
      expect(triggerBus.publishedTriggers).toEqual([CRON_LOYALTY_EXPIRY_WARNING_TRIGGER]);
    });
  });
});
