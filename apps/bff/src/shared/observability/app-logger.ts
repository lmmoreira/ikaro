import { Injectable } from '@nestjs/common';
import { BaseAppLogger, formatGoogleCloudLoggingFields } from '@ikaro/observability';

@Injectable()
export class AppLogger extends BaseAppLogger {
  constructor(context?: string) {
    super('bff', context);
  }

  protected formatVendorFields(
    traceId: string | null,
    spanId: string | null,
  ): Record<string, unknown> {
    return formatGoogleCloudLoggingFields(process.env['GCP_PROJECT'], traceId, spanId);
  }
}
