import { Injectable } from '@nestjs/common';
import { BaseAppLogger } from '@ikaro/observability';
import { getTenantStore } from '../tenant/tenant-context';

@Injectable()
export class AppLogger extends BaseAppLogger {
  constructor(context?: string) {
    super('backend', context);
  }

  protected enrich(): Record<string, unknown> {
    const store = getTenantStore();
    return store ? { tenantId: store.tenantId, correlationId: store.correlationId } : {};
  }
}
