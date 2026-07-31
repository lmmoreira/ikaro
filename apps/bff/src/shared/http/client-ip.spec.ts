import { getClientIp } from './client-ip';

describe('getClientIp() (TD38: trusts ikaro-web-forwarded X-Real-Client-Ip)', () => {
  it('reads X-Real-Client-Ip', () => {
    const ip = getClientIp({ headers: { 'x-real-client-ip': '203.0.113.10' } });
    expect(ip).toBe('203.0.113.10');
  });

  it('uses the first entry for an array-valued header', () => {
    const ip = getClientIp({
      headers: { 'x-real-client-ip': ['203.0.113.10', '203.0.113.11'] },
    });
    expect(ip).toBe('203.0.113.10');
  });

  it('falls back to req.ip when the header is genuinely absent (e.g. local dev, no gateway)', () => {
    const ip = getClientIp({ headers: {}, ip: '10.0.0.1' });
    expect(ip).toBe('10.0.0.1');
  });

  it('returns "unknown" when neither the header nor req.ip is available', () => {
    const ip = getClientIp({ headers: {} });
    expect(ip).toBe('unknown');
  });

  it('never falls back to X-Forwarded-For — that header is meaningless post-TD38', () => {
    const ip = getClientIp({
      headers: { 'x-forwarded-for': '198.51.100.1, 203.0.113.99' },
      ip: '10.0.0.1',
    });
    expect(ip).toBe('10.0.0.1');
  });
});
