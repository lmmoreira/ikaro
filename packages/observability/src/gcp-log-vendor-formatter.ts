import { formatGoogleCloudLoggingFields } from './google-cloud-logging';
import { LogVendorFormatter } from './log-vendor-formatter';

export interface GcpLogVendorFormatterOptions {
  projectId?: string;
}

export class GoogleCloudLogVendorFormatter implements LogVendorFormatter {
  constructor(private readonly options: GcpLogVendorFormatterOptions = {}) {}

  format(traceId: string | null, spanId: string | null): Record<string, unknown> {
    return formatGoogleCloudLoggingFields(this.options.projectId, traceId, spanId);
  }
}
