import { InternalApiGuard } from '../../../../shared/guards/internal-api.guard';
import { AdvanceableClock } from '../../../../shared/infrastructure/clock/advanceable-clock.adapter';
import { AdvanceClockUseCase } from '../../application/use-cases/advance-clock.use-case';
import { GetClockUseCase } from '../../application/use-cases/get-clock.use-case';
import { ResetClockUseCase } from '../../application/use-cases/reset-clock.use-case';
import { InternalDevClockController } from './internal-dev-clock.controller';

describe('InternalDevClockController', () => {
  let clock: AdvanceableClock;
  let controller: InternalDevClockController;

  beforeEach(() => {
    clock = new AdvanceableClock();
    controller = new InternalDevClockController(
      new AdvanceClockUseCase(clock),
      new ResetClockUseCase(clock),
      new GetClockUseCase(clock),
    );
  });

  it('advance moves the clock and returns the offset and instanceId', () => {
    expect(controller.advance({ days: 1 })).toEqual({
      offsetMs: 24 * 60 * 60 * 1000,
      instanceId: clock.instanceId,
    });
  });

  it('advance past the cumulative cap is a 400 through the error mapper', () => {
    controller.advance({ days: 36_500 });

    expect(() => controller.advance({ hours: 1 })).toThrow(
      expect.objectContaining({ status: 400 }) as Error,
    );
  });

  it('get returns the offset and instanceId', () => {
    controller.advance({ hours: 1 });

    expect(controller.get()).toEqual({ offsetMs: 60 * 60 * 1000, instanceId: clock.instanceId });
  });

  it('reset returns the offset to zero', () => {
    controller.advance({ hours: 1 });

    expect(controller.reset().offsetMs).toBe(0);
  });

  // Interim state (M25-S12 until S15a): InternalApiGuard alone. S15a flips this assertion to
  // InternalApiGuard + PlatformAdminGuard.
  it('carries InternalApiGuard only', () => {
    const guards = Reflect.getMetadata('__guards__', InternalDevClockController) as unknown[];

    expect(guards).toEqual([InternalApiGuard]);
  });
});
