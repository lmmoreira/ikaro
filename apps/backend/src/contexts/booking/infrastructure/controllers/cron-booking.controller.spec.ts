import { CronBookingController } from './cron-booking.controller';
import { ITriggerBus } from '../../../../shared/ports/trigger-bus.port';

describe('CronBookingController', () => {
  let controller: CronBookingController;
  let triggerBus: jest.Mocked<ITriggerBus>;

  beforeEach(() => {
    triggerBus = {
      registerTrigger: jest.fn(),
      publishTrigger: jest.fn().mockResolvedValue(undefined),
    };
    controller = new CronBookingController(triggerBus);
  });

  afterEach(() => jest.resetAllMocks());

  it('returns { ok: true }', async () => {
    const result = await controller.reminders();
    expect(result).toEqual({ ok: true });
  });

  it('publishes the cron-reminders trigger', async () => {
    await controller.reminders();
    expect(triggerBus.publishTrigger).toHaveBeenCalledTimes(1);
    expect(triggerBus.publishTrigger).toHaveBeenCalledWith('cron-reminders');
  });
});
