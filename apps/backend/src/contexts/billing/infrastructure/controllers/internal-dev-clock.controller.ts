import { Body, Controller, Get, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { ZodValidationPipe } from '@ikaro/nestjs-http';
import { InternalApiGuard } from '../../../../shared/guards/internal-api.guard';
import { PlatformAdminGuard } from '../../../../shared/guards/platform-admin.guard';
import { AdvanceClockDto, AdvanceClockSchema } from '../../application/dtos/advance-clock.dto';
import {
  AdvanceClockUseCase,
  AdvanceClockUseCaseResult,
} from '../../application/use-cases/advance-clock.use-case';
import {
  GetClockUseCase,
  GetClockUseCaseResult,
} from '../../application/use-cases/get-clock.use-case';
import {
  ResetClockUseCase,
  ResetClockUseCaseResult,
} from '../../application/use-cases/reset-clock.use-case';
import { mapClockError } from '../../../../shared/http/clock-error.mapper';

// Both operator-key guards (M25-S15a): the route moves time, so it needs `X-Internal-Key` and
// `X-Platform-Admin-Key`. Registered only in `local` and `staging` (`DevClockModule.register`).
@UseGuards(InternalApiGuard, PlatformAdminGuard)
@Controller('internal/dev/clock')
export class InternalDevClockController {
  constructor(
    private readonly advanceClock: AdvanceClockUseCase,
    private readonly resetClock: ResetClockUseCase,
    private readonly getClock: GetClockUseCase,
  ) {}

  @Get()
  get(): GetClockUseCaseResult {
    return this.getClock.execute();
  }

  @Post('advance')
  @HttpCode(HttpStatus.OK)
  advance(
    @Body(new ZodValidationPipe(AdvanceClockSchema)) dto: AdvanceClockDto,
  ): AdvanceClockUseCaseResult {
    try {
      return this.advanceClock.execute({ days: dto.days, hours: dto.hours });
    } catch (err) {
      // Synchronous use case: the mapper turns the domain error into the 400 (it always throws).
      return mapClockError(err);
    }
  }

  @Post('reset')
  @HttpCode(HttpStatus.OK)
  reset(): ResetClockUseCaseResult {
    return this.resetClock.execute();
  }
}
