import { InMemoryEventBus } from '../../../../test/infrastructure/in-memory-event-bus';
import { CronBookingController } from './cron-booking.controller';

describe('CronBookingController', () => {
  let controller: CronBookingController;
  let triggerBus: InMemoryEventBus;

  beforeEach(() => {
    triggerBus = new InMemoryEventBus();
    controller = new CronBookingController(triggerBus);
  });

  it('returns { ok: true }', async () => {
    const result = await controller.reminders();
    expect(result).toEqual({ ok: true });
  });

  it('publishes the cron-reminders trigger', async () => {
    await controller.reminders();
    expect(triggerBus.publishedTriggers).toEqual(['cron-reminders']);
  });
});
