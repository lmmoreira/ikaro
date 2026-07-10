import {
  HealthCheckService,
  HealthIndicatorFunction,
  TypeOrmHealthIndicator,
} from '@nestjs/terminus';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  it('live() returns ok without touching any dependency', () => {
    const health = { check: jest.fn() } as unknown as HealthCheckService;
    const db = { pingCheck: jest.fn() } as unknown as TypeOrmHealthIndicator;
    const controller = new HealthController(health, db);

    expect(controller.live()).toEqual({ status: 'ok' });
    expect(health.check).not.toHaveBeenCalled();
    expect(db.pingCheck).not.toHaveBeenCalled();
  });

  it('ready() delegates to HealthCheckService with a single 2s TypeORM ping', async () => {
    const checkResult = { status: 'ok', info: {}, error: {}, details: {} };
    const health = {
      check: jest.fn().mockResolvedValue(checkResult),
    } as unknown as HealthCheckService;
    const db = {
      pingCheck: jest.fn().mockResolvedValue({ database: { status: 'up' } }),
    } as unknown as TypeOrmHealthIndicator;
    const controller = new HealthController(health, db);

    const result = await controller.ready();

    expect(result).toBe(checkResult);
    expect(health.check).toHaveBeenCalledTimes(1);

    const [indicators] = (health.check as jest.Mock).mock.calls[0] as [HealthIndicatorFunction[]];
    expect(indicators).toHaveLength(1);

    await indicators[0]();
    expect(db.pingCheck).toHaveBeenCalledWith('database', { timeout: 2000 });
  });
});
