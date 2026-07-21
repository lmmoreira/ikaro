import { redactSensitiveQueryParams, SENSITIVE_QUERY_PARAMS } from './otel-query-redaction';

describe('redactSensitiveQueryParams', () => {
  it('redacts the OAuth authorization code and state on the callback route', () => {
    const result = redactSensitiveQueryParams(
      '/auth/google/callback?code=4/0AeaYSHD-real-redeemable-code&state=signed.jwt.state',
    );

    expect(result).not.toContain('4/0AeaYSHD-real-redeemable-code');
    expect(result).not.toContain('signed.jwt.state');
    expect(result).toBe('/auth/google/callback?code=REDACTED&state=REDACTED');
  });

  it('redacts error and error_description on an OAuth error callback', () => {
    const result = redactSensitiveQueryParams(
      '/auth/google/callback?error=access_denied&error_description=user+cancelled+the+flow',
    );

    expect(result).not.toContain('access_denied');
    expect(result).not.toContain('user cancelled the flow');
    expect(result).toBe('/auth/google/callback?error=REDACTED&error_description=REDACTED');
  });

  it("redacts OpenTelemetry's own default cloud-signing params (restated, not lost)", () => {
    for (const param of ['sig', 'Signature', 'AWSAccessKeyId', 'X-Goog-Signature']) {
      const result = redactSensitiveQueryParams(`/some-signed-url?${param}=super-secret-value`);
      expect(result).not.toContain('super-secret-value');
      expect(result).toBe(`/some-signed-url?${param}=REDACTED`);
    }
  });

  it('leaves non-sensitive params untouched', () => {
    const result = redactSensitiveQueryParams('/v1/staff?page=2&pageSize=20');
    expect(result).toBe('/v1/staff?page=2&pageSize=20');
  });

  it('redacts only the sensitive params in a mixed query string, preserving the rest', () => {
    const result = redactSensitiveQueryParams(
      '/auth/google/callback?code=secret-code&scope=email+profile&authuser=0',
    );

    expect(result).not.toContain('secret-code');
    expect(result).toContain('scope=email+profile');
    expect(result).toContain('authuser=0');
    expect(result).toContain('code=REDACTED');
  });

  it('returns the input unchanged when there is no query string', () => {
    expect(redactSensitiveQueryParams('/health/live')).toBe('/health/live');
  });

  it('returns an empty-query path unchanged', () => {
    expect(redactSensitiveQueryParams('/v1/bookings?')).toBe('/v1/bookings?');
  });

  it('exposes the full sensitive param set for reuse (e.g. redactedQueryParams config)', () => {
    expect(Array.from(SENSITIVE_QUERY_PARAMS)).toEqual(
      expect.arrayContaining(['code', 'state', 'error', 'error_description', 'sig', 'Signature']),
    );
  });
});
