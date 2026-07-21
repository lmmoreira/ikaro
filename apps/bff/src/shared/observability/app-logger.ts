import { BaseAppLogger, createLogVendorFormatter } from '@ikaro/observability';
import { getRequestStore } from '../request/request-context';

export class AppLogger extends BaseAppLogger {
  constructor(context?: string) {
    super(
      'bff',
      createLogVendorFormatter({
        vendor: process.env['LOG_VENDOR'],
        gcp: {
          projectId: process.env['GCP_PROJECT'],
        },
      }),
      context,
    );
  }

  protected enrich(): Record<string, unknown> {
    const store = getRequestStore();
    if (!store) {
      return {};
    }
    return {
      correlationId: store.correlationId,
      ...(store.tenantId ? { tenantId: store.tenantId } : {}),
    };
  }
}
