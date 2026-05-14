import { Test } from '@nestjs/testing';
import { HealthController } from './health.controller';

describe('HealthController (integration)', () => {
  let controller: HealthController;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [HealthController],
    }).compile();

    controller = module.get(HealthController);
  });

  it('live() returns ok', () => {
    expect(controller.live()).toEqual({ status: 'ok' });
  });
});
