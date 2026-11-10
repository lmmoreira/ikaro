import { Body, Controller, Get, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { ZodValidationPipe } from '@ikaro/nestjs-http';
import { InternalApiGuard } from '../../../../shared/guards/internal-api.guard';
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

// Interim guard (M25-S12 until S15a): `InternalApiGuard` alone, because `PlatformAdminGuard` still
// lives in Platform. S15a moves it to `src/shared/guards/` and adds it here. Registered only in
// `local` and `staging` (`DevClockModule.register`).
@UseGuards(InternalApiGuard)
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
    return this.advanceClock.execute({ days: dto.days, hours: dto.hours });
  }

  @Post('reset')
  @HttpCode(HttpStatus.OK)
  reset(): ResetClockUseCaseResult {
    return this.resetClock.execute();
  }
}
