import { Injectable } from '@nestjs/common';
import { BaseAppLogger } from '@ikaro/observability';
import { getRequestStore } from '../request/request-context';

@Injectable()
export class AppLogger extends BaseAppLogger {
  constructor(context?: string) {
    super('backend', context);
  }

  protected enrich(): Record<string, unknown> {
    const store = getRequestStore();
    return store ? { tenantId: store.tenantId, correlationId: store.correlationId } : {};
  }
}
