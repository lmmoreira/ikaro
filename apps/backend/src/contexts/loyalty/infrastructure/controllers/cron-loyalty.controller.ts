import { Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import {
  ExpirePointsUseCaseResult,
  ExpirePointsUseCase,
} from '../../application/use-cases/expire-points/expire-points.use-case';
import {
  NotifyExpiringPointsUseCaseResult,
  NotifyExpiringPointsUseCase,
} from '../../application/use-cases/notify-expiring-points/notify-expiring-points.use-case';
import { mapLoyaltyError } from '../http/loyalty-error.mapper';

// MVP: protected at network level (backend not publicly reachable — BFF-only access).
// M115-S03 adds CronAuthGuard (OIDC token from GCP Cloud Scheduler).
@Controller('cron')
export class CronLoyaltyController {
  constructor(
    private readonly expirePoints: ExpirePointsUseCase,
    private readonly notifyExpiringPoints: NotifyExpiringPointsUseCase,
  ) {}

  @Post('loyalty-expiry')
  @HttpCode(HttpStatus.OK)
  runExpiry(): Promise<ExpirePointsUseCaseResult> {
    return this.expirePoints.execute().catch(mapLoyaltyError);
  }

  @Post('loyalty-expiry-warning')
  @HttpCode(HttpStatus.OK)
  runExpiryWarning(): Promise<NotifyExpiringPointsUseCaseResult> {
    return this.notifyExpiringPoints.execute().catch(mapLoyaltyError);
  }
}
