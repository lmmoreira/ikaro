import { createLogVendorFormatter } from './log-vendor-formatter.factory';

describe('createLogVendorFormatter()', () => {
  it('defaults to the GCP formatter when no vendor is set', () => {
    const formatter = createLogVendorFormatter({
      gcp: { projectId: 'ikaro-staging' },
    });

    expect(formatter.format('0123456789abcdef0123456789abcdef', '0123456789abcdef')).toEqual({
      'logging.googleapis.com/trace':
        'projects/ikaro-staging/traces/0123456789abcdef0123456789abcdef',
      'logging.googleapis.com/spanId': '0123456789abcdef',
    });
  });

  it('returns no vendor-specific fields when vendor=none', () => {
    const formatter = createLogVendorFormatter({
      vendor: 'none',
      gcp: { projectId: 'ikaro-staging' },
    });

    expect(formatter.format('0123456789abcdef0123456789abcdef', '0123456789abcdef')).toEqual({});
  });

  it('falls back to the noop formatter for unknown vendors', () => {
    const formatter = createLogVendorFormatter({
      vendor: 'azure',
      gcp: { projectId: 'ikaro-staging' },
    });

    expect(formatter.format('0123456789abcdef0123456789abcdef', '0123456789abcdef')).toEqual({});
  });
});
