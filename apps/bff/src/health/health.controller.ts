import { Controller, Get, HttpStatus } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { SkipThrottle } from '@nestjs/throttler';
import { firstValueFrom } from 'rxjs';
import { BffErrorCode } from '@ikaro/types';
import { Public } from '../shared/decorators/public.decorator';
import { throwProblemDetail } from '../shared/http/problem-detail';

@Public()
@SkipThrottle()
@Controller('health')
export class HealthController {
  private readonly backendUrl: string;

  constructor(
    private readonly http: HttpService,
    private readonly config: ConfigService,
  ) {
    this.backendUrl = this.config.getOrThrow<string>('BACKEND_INTERNAL_URL');
  }

  @Get('live')
  live(): { status: string } {
    return { status: 'ok' };
  }

  @Get('ready')
  async ready(): Promise<{ status: string }> {
    try {
      // Chained to the backend's own /health/ready (not /health/live): Cloud Run has no
      // continuous readiness-based traffic pulling (only startup + liveness probes), so
      // there's no cascading-blast-radius cost to this depth — it just makes this readiness
      // check (used for BFF's own startup gate + external uptime alerting) mean "the backend
      // can actually serve," not merely "the backend process is up."
      await firstValueFrom(this.http.get(`${this.backendUrl}/health/ready`, { timeout: 2000 }));
      return { status: 'ok' };
    } catch {
      throw throwProblemDetail(
        HttpStatus.SERVICE_UNAVAILABLE,
        BffErrorCode.UPSTREAM_UNAVAILABLE,
        'Backend is not ready',
      );
    }
  }
}
