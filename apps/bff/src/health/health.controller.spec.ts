import { HealthController } from './health.controller';

describe('HealthController', () => {
  it('returns ok for live', () => {
    const controller = new HealthController();

    expect(controller.live()).toEqual({ status: 'ok' });
  });

  it('returns ok for ready', () => {
    const controller = new HealthController();

    expect(controller.ready()).toEqual({ status: 'ok' });
  });
});
