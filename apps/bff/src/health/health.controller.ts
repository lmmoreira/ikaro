import { Controller, Get, HttpException, HttpStatus } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { Public } from '../shared/decorators/public.decorator';

@Public()
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
      await firstValueFrom(this.http.get(`${this.backendUrl}/health/live`, { timeout: 2000 }));
      return { status: 'ok' };
    } catch {
      throw new HttpException(
        {
          type: 'about:blank',
          title: 'Service Unavailable',
          status: HttpStatus.SERVICE_UNAVAILABLE,
          detail: 'Backend is not reachable',
        },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }
}
