import { Injectable } from '@nestjs/common';
import { BaseAppLogger } from '@ikaro/observability';

@Injectable()
export class AppLogger extends BaseAppLogger {
  constructor(context?: string) {
    super('bff', context);
  }
}
