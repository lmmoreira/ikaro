import { CronLoyaltyController } from './cron-loyalty.controller';
import { ITriggerBus } from '../../../../shared/ports/trigger-bus.port';

describe('CronLoyaltyController', () => {
  let controller: CronLoyaltyController;
  let triggerBus: jest.Mocked<ITriggerBus>;

  beforeEach(() => {
    triggerBus = {
      registerTrigger: jest.fn(),
      publishTrigger: jest.fn().mockResolvedValue(undefined),
    };
    controller = new CronLoyaltyController(triggerBus);
  });

  afterEach(() => jest.resetAllMocks());

  describe('POST /cron/loyalty-expiry', () => {
    it('returns { ok: true }', async () => {
      const result = await controller.runExpiry();
      expect(result).toEqual({ ok: true });
    });

    it('publishes the cron-loyalty-expiry trigger', async () => {
      await controller.runExpiry();
      expect(triggerBus.publishTrigger).toHaveBeenCalledTimes(1);
      expect(triggerBus.publishTrigger).toHaveBeenCalledWith('cron-loyalty-expiry');
    });
  });

  describe('POST /cron/loyalty-expiry-warning', () => {
    it('returns { ok: true }', async () => {
      const result = await controller.runExpiryWarning();
      expect(result).toEqual({ ok: true });
    });

    it('publishes the cron-loyalty-expiry-warning trigger', async () => {
      await controller.runExpiryWarning();
      expect(triggerBus.publishTrigger).toHaveBeenCalledTimes(1);
      expect(triggerBus.publishTrigger).toHaveBeenCalledWith('cron-loyalty-expiry-warning');
    });
  });
});
