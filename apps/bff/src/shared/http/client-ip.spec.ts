import { getClientIp } from './client-ip';

describe('getClientIp()', () => {
  describe('production', () => {
    it('uses CF-Connecting-IP', () => {
      const ip = getClientIp(
        { headers: { 'cf-connecting-ip': '203.0.113.10' }, ip: '10.0.0.1' },
        'production',
      );
      expect(ip).toBe('203.0.113.10');
    });

    it('falls back to req.ip when CF-Connecting-IP is absent', () => {
      const ip = getClientIp({ headers: {}, ip: '10.0.0.1' }, 'production');
      expect(ip).toBe('10.0.0.1');
    });

    it('ignores X-Forwarded-For even if present — CF-Connecting-IP takes priority', () => {
      const ip = getClientIp(
        {
          headers: {
            'cf-connecting-ip': '203.0.113.10',
            'x-forwarded-for': '198.51.100.1, 203.0.113.99',
          },
          ip: '10.0.0.1',
        },
        'production',
      );
      expect(ip).toBe('203.0.113.10');
    });
  });

  describe('staging (no Cloudflare/ALB)', () => {
    it('uses the rightmost X-Forwarded-For hop', () => {
      const ip = getClientIp(
        { headers: { 'x-forwarded-for': '198.51.100.1, 203.0.113.99' }, ip: '10.0.0.1' },
        'staging',
      );
      expect(ip).toBe('203.0.113.99');
    });

    it('ignores the attacker-controlled leftmost XFF value', () => {
      const ip = getClientIp(
        { headers: { 'x-forwarded-for': '1.2.3.4 (spoofed), 203.0.113.99' }, ip: '10.0.0.1' },
        'staging',
      );
      expect(ip).not.toBe('1.2.3.4 (spoofed)');
      expect(ip).toBe('203.0.113.99');
    });

    it('falls back to req.ip when no X-Forwarded-For header is present', () => {
      const ip = getClientIp({ headers: {}, ip: '10.0.0.1' }, 'staging');
      expect(ip).toBe('10.0.0.1');
    });

    it('handles a single-hop X-Forwarded-For value', () => {
      const ip = getClientIp(
        { headers: { 'x-forwarded-for': '203.0.113.99' }, ip: '10.0.0.1' },
        'staging',
      );
      expect(ip).toBe('203.0.113.99');
    });

    it('falls back to req.ip when the rightmost hop is an empty string (trailing comma)', () => {
      const ip = getClientIp(
        { headers: { 'x-forwarded-for': '203.0.113.99,' }, ip: '10.0.0.1' },
        'staging',
      );
      expect(ip).toBe('10.0.0.1');
    });

    it('returns "unknown" when neither X-Forwarded-For nor req.ip is available', () => {
      const ip = getClientIp({ headers: {} }, 'staging');
      expect(ip).toBe('unknown');
    });
  });

  describe('local', () => {
    it('behaves like staging (rightmost XFF, fallback to req.ip)', () => {
      const ip = getClientIp({ headers: {}, ip: '127.0.0.1' }, 'local');
      expect(ip).toBe('127.0.0.1');
    });
  });

  describe('array-valued headers (some HTTP stacks pass repeated headers as string[])', () => {
    it('uses the first array entry for CF-Connecting-IP', () => {
      const ip = getClientIp(
        { headers: { 'cf-connecting-ip': ['203.0.113.10', '203.0.113.11'] }, ip: '10.0.0.1' },
        'production',
      );
      expect(ip).toBe('203.0.113.10');
    });
  });

  it('returns "unknown" when neither a header nor req.ip is available', () => {
    const ip = getClientIp({ headers: {} }, 'production');
    expect(ip).toBe('unknown');
  });
});
