import { InMemoryEventBus } from '../../../../test/infrastructure/in-memory-event-bus';
import { CRON_LEAD_FORM_RETENTION_TRIGGER } from '../events/cron-trigger-names.constants';
import { CronLeadFormController } from './cron-lead-form.controller';

describe('CronLeadFormController', () => {
  let controller: CronLeadFormController;
  let triggerBus: InMemoryEventBus;

  beforeEach(() => {
    triggerBus = new InMemoryEventBus();
    controller = new CronLeadFormController(triggerBus);
  });

  describe('POST /cron/lead-form-retention', () => {
    it('returns { ok: true }', async () => {
      const result = await controller.runRetentionPurge();
      expect(result).toEqual({ ok: true });
    });

    it('publishes the cron-lead-form-retention trigger', async () => {
      await controller.runRetentionPurge();
      expect(triggerBus.publishedTriggers).toEqual([CRON_LEAD_FORM_RETENTION_TRIGGER]);
    });
  });
});
