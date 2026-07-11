import { LogVendorFormatter } from './log-vendor-formatter';

export interface GcpLogVendorFormatterOptions {
  projectId?: string;
}

export function formatGoogleCloudLoggingFields(
  projectId: string | undefined,
  traceId: string | null,
  spanId: string | null,
): Record<string, string> {
  if (!projectId || !traceId || !spanId) {
    return {};
  }

  return {
    // GCP-specific field names — swap here on vendor change.
    'logging.googleapis.com/trace': `projects/${projectId}/traces/${traceId}`,
    'logging.googleapis.com/spanId': spanId,
  };
}

export class GoogleCloudLogVendorFormatter implements LogVendorFormatter {
  constructor(private readonly options: GcpLogVendorFormatterOptions = {}) {}

  format(traceId: string | null, spanId: string | null): Record<string, unknown> {
    return formatGoogleCloudLoggingFields(this.options.projectId, traceId, spanId);
  }
}
