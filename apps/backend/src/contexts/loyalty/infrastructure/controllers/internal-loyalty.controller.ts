import { Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import {
  ExpirePointsResult,
  ExpirePointsUseCase,
} from '../../application/use-cases/expire-points/expire-points.use-case';
import { mapLoyaltyError } from '../http/loyalty-error.mapper';

// MVP: protected at network level (backend not publicly reachable — BFF-only access).
// M115-S03 adds InternalApiGuard (X-Internal-Key header) — same pattern as other /internal/* controllers.
@Controller('internal/loyalty')
export class InternalLoyaltyController {
  constructor(private readonly expirePoints: ExpirePointsUseCase) {}

  @Post('expire-points')
  @HttpCode(HttpStatus.OK)
  runExpiry(): Promise<ExpirePointsResult> {
    return this.expirePoints.execute().catch(mapLoyaltyError);
  }
}
