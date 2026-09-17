import { InMemoryEventBus } from '../../../../test/infrastructure/in-memory-event-bus';
import {
  CRON_REMINDERS_TRIGGER,
  CRON_RESOURCE_OCCUPANCY_RETENTION_PURGE_TRIGGER,
} from '../events/cron-trigger-names.constants';
import { CronBookingController } from './cron-booking.controller';

describe('CronBookingController', () => {
  let controller: CronBookingController;
  let triggerBus: InMemoryEventBus;

  beforeEach(() => {
    triggerBus = new InMemoryEventBus();
    controller = new CronBookingController(triggerBus);
  });

  describe('POST /cron/reminders', () => {
    it('returns { ok: true }', async () => {
      const result = await controller.reminders();
      expect(result).toEqual({ ok: true });
    });

    it('publishes the cron-reminders trigger', async () => {
      await controller.reminders();
      expect(triggerBus.publishedTriggers).toEqual([CRON_REMINDERS_TRIGGER]);
    });
  });

  describe('POST /cron/resource-occupancy-retention-purge', () => {
    it('returns { ok: true }', async () => {
      const result = await controller.resourceOccupancyRetentionPurge();
      expect(result).toEqual({ ok: true });
    });

    it('publishes the cron-resource-occupancy-retention-purge trigger', async () => {
      await controller.resourceOccupancyRetentionPurge();
      expect(triggerBus.publishedTriggers).toEqual([
        CRON_RESOURCE_OCCUPANCY_RETENTION_PURGE_TRIGGER,
      ]);
    });
  });
});
