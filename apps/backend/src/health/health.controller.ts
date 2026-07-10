import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import {
  HealthCheck,
  HealthCheckResult,
  HealthCheckService,
  TypeOrmHealthIndicator,
} from '@nestjs/terminus';
import { AppLogger } from '../shared/observability/app-logger';
import { Public } from '../shared/decorators/public.decorator';

@Public()
@Controller('health')
export class HealthController {
  private readonly logger = new AppLogger(HealthController.name);

  constructor(
    private readonly health: HealthCheckService,
    private readonly db: TypeOrmHealthIndicator,
  ) {}

  @Get('live')
  live(): { status: string } {
    return { status: 'ok' };
  }

  @Get('ready')
  @HealthCheck()
  async ready(): Promise<HealthCheckResult> {
    try {
      return await this.health.check([() => this.db.pingCheck('database', { timeout: 2000 })]);
    } catch (err) {
      // Terminus's default 503 body includes the raw indicator error message (e.g. a
      // connection/timeout detail) — this route is @Public(), so don't leak it. Log the
      // full diagnostics server-side and return a fixed, detail-free failure shape.
      this.logger.error('Readiness check failed', err instanceof Error ? err.stack : String(err));
      throw new ServiceUnavailableException({
        status: 'error',
        info: {},
        error: { database: { status: 'down' } },
        details: { database: { status: 'down' } },
      });
    }
  }
}
