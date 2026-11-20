import { InMemoryEventBus } from '../../../../test/infrastructure/in-memory-event-bus';
import { CRON_BILLING_ISSUE_CHARGES_TRIGGER } from '../events/cron-trigger-names.constants';
import { CronBillingController } from './cron-billing.controller';

describe('CronBillingController', () => {
  let controller: CronBillingController;
  let triggerBus: InMemoryEventBus;

  beforeEach(() => {
    triggerBus = new InMemoryEventBus();
    controller = new CronBillingController(triggerBus);
  });

  describe('POST /cron/billing-issue-charges', () => {
    it('returns { ok: true }', async () => {
      await expect(controller.issueCharges()).resolves.toEqual({ ok: true });
    });

    it('publishes the cron-billing-issue-charges trigger', async () => {
      await controller.issueCharges();

      expect(triggerBus.publishedTriggers).toEqual([CRON_BILLING_ISSUE_CHARGES_TRIGGER]);
    });
  });
});
