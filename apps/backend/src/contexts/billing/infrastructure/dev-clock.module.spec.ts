import { Test } from '@nestjs/testing';
import { ClockModule } from '../../../shared/infrastructure/clock/clock.module';
import { DEV_CLOCK_CONTROL } from '../../../shared/ports/dev-clock-control.port';
import { testConfigModule } from '../../../test/utils/test-config-module';
import { AdvanceClockUseCase } from '../application/use-cases/advance-clock.use-case';
import { GetClockUseCase } from '../application/use-cases/get-clock.use-case';
import { ResetClockUseCase } from '../application/use-cases/reset-clock.use-case';
import { InternalDevClockController } from './controllers/internal-dev-clock.controller';
import { DevClockModule } from './dev-clock.module';

async function build(appEnv: 'local' | 'staging' | 'production') {
  return Test.createTestingModule({
    imports: [testConfigModule(), ClockModule.register(appEnv), DevClockModule.register(appEnv)],
  }).compile();
}

describe('DevClockModule.register', () => {
  it.each(['local', 'staging'] as const)(
    'provides the controller, the three use cases and IDevClockControl in %s',
    async (env) => {
      const moduleRef = await build(env);

      expect(moduleRef.get(InternalDevClockController)).toBeDefined();
      expect(moduleRef.get(AdvanceClockUseCase)).toBeDefined();
      expect(moduleRef.get(ResetClockUseCase)).toBeDefined();
      expect(moduleRef.get(GetClockUseCase)).toBeDefined();
      expect(moduleRef.get(DEV_CLOCK_CONTROL)).toBeDefined();
    },
  );

  it('provides no controller, use case or IDevClockControl in production', async () => {
    const moduleRef = await build('production');

    expect(() => moduleRef.get(InternalDevClockController)).toThrow();
    expect(() => moduleRef.get(AdvanceClockUseCase)).toThrow();
    expect(() => moduleRef.get(ResetClockUseCase)).toThrow();
    expect(() => moduleRef.get(GetClockUseCase)).toThrow();
    expect(() => moduleRef.get(DEV_CLOCK_CONTROL)).toThrow();
  });
});
