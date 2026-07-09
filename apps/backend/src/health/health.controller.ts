import { Controller, Get } from '@nestjs/common';
import { Public } from '../shared/decorators/public.decorator';

@Public()
@Controller('health')
export class HealthController {
  @Get('live')
  live(): { status: string } {
    return { status: 'ok' };
  }

  @Get('ready')
  ready(): { status: string } {
    return { status: 'ok' };
  }
}
