import { formatGoogleCloudLoggingFields } from './google-cloud-logging';
import {
  CreateLogVendorFormatterOptions,
  LogVendor,
  LogVendorFormatter,
  NoopLogVendorFormatter,
} from './log-vendor-formatter';

class GoogleCloudLogVendorFormatter implements LogVendorFormatter {
  constructor(private readonly projectId?: string) {}

  format(traceId: string | null, spanId: string | null): Record<string, unknown> {
    return formatGoogleCloudLoggingFields(this.projectId, traceId, spanId);
  }
}

const SUPPORTED_LOG_VENDORS: Record<LogVendor, (options: CreateLogVendorFormatterOptions) => LogVendorFormatter> = {
  gcp: (options) => new GoogleCloudLogVendorFormatter(options.gcpProjectId),
  none: () => new NoopLogVendorFormatter(),
};

export function createLogVendorFormatter(
  options: CreateLogVendorFormatterOptions,
): LogVendorFormatter {
  const vendor = normalizeLogVendor(options.vendor);
  return SUPPORTED_LOG_VENDORS[vendor](options);
}

function normalizeLogVendor(vendor: string | undefined): LogVendor {
  if (!vendor) {
    return 'gcp';
  }

  const normalizedVendor = vendor.toLowerCase();
  if (normalizedVendor in SUPPORTED_LOG_VENDORS) {
    return normalizedVendor as LogVendor;
  }

  return 'none';
}
