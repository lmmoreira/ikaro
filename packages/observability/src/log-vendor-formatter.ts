export interface LogVendorFormatter {
  format(traceId: string | null, spanId: string | null): Record<string, unknown>;
}

export class NoopLogVendorFormatter implements LogVendorFormatter {
  format(_traceId: string | null, _spanId: string | null): Record<string, unknown> {
    return {};
  }
}

export type LogVendor = 'gcp' | 'none';
