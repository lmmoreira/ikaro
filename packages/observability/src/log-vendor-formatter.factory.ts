import { LogVendor, LogVendorFormatter, NoopLogVendorFormatter } from './log-vendor-formatter';
import {
  GcpLogVendorFormatterOptions,
  GoogleCloudLogVendorFormatter,
} from './gcp-log-vendor-formatter';

export interface CreateLogVendorFormatterOptions {
  vendor?: string;
  gcp?: GcpLogVendorFormatterOptions;
}

const SUPPORTED_LOG_VENDORS: Record<
  LogVendor,
  (options: CreateLogVendorFormatterOptions) => LogVendorFormatter
> = {
  gcp: (options) => new GoogleCloudLogVendorFormatter(options.gcp),
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
