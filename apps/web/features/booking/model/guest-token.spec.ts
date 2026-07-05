import jwt from 'jsonwebtoken';
import { verifyGuestToken, decodeUnverifiedTenantSlug } from './guest-token';

const SECRET = 'test-secret-must-be-at-least-32-chars-long!!';
const BOOKING_ID = '40000000-0000-4000-8000-000000000001';
const TENANT_ID = '10000000-0000-4000-8000-000000000001';
const CONTACT_EMAIL = 'guest@example.com';

function makeToken(overrides: Record<string, unknown> = {}, secret = SECRET): string {
  return jwt.sign(
    { bookingId: BOOKING_ID, tenantId: TENANT_ID, contactEmail: CONTACT_EMAIL, ...overrides },
    secret,
  );
}

describe('verifyGuestToken()', () => {
  const originalSecret = process.env.JWT_SECRET;

  beforeEach(() => {
    process.env.JWT_SECRET = SECRET;
  });

  afterEach(() => {
    process.env.JWT_SECRET = originalSecret;
  });

  it('returns the decoded payload for a valid token', () => {
    const token = makeToken();
    expect(verifyGuestToken(token)).toMatchObject({
      bookingId: BOOKING_ID,
      tenantId: TENANT_ID,
      contactEmail: CONTACT_EMAIL,
    });
  });

  it('includes tenantSlug when present in the payload', () => {
    const token = makeToken({ tenantSlug: 'lava-car-test' });
    expect(verifyGuestToken(token)).toMatchObject({ tenantSlug: 'lava-car-test' });
  });

  it('returns null when tenantSlug is absent (pre-M13-S38 tokens)', () => {
    const token = makeToken();
    expect(verifyGuestToken(token)?.tenantSlug).toBeUndefined();
  });

  it('returns null for an invalid signature', () => {
    const token = makeToken({}, 'wrong-secret-that-does-not-match-the-real-one');
    expect(verifyGuestToken(token)).toBeNull();
  });

  it('returns null for an expired token', () => {
    const token = jwt.sign(
      { bookingId: BOOKING_ID, tenantId: TENANT_ID, contactEmail: CONTACT_EMAIL },
      SECRET,
      { expiresIn: -1 },
    );
    expect(verifyGuestToken(token)).toBeNull();
  });

  it('returns null when the payload does not match the guest schema', () => {
    const token = jwt.sign({ sub: 'user-id', role: 'CUSTOMER' }, SECRET);
    expect(verifyGuestToken(token)).toBeNull();
  });

  it('returns null when JWT_SECRET is not configured', () => {
    delete process.env.JWT_SECRET;
    const token = makeToken();
    expect(verifyGuestToken(token)).toBeNull();
  });
});

describe('decodeUnverifiedTenantSlug()', () => {
  it('returns tenantSlug from a well-formed token even with the wrong secret', () => {
    const token = makeToken(
      { tenantSlug: 'lava-car-test' },
      'a-completely-different-secret-than-the-real-one',
    );
    expect(decodeUnverifiedTenantSlug(token)).toBe('lava-car-test');
  });

  it('returns tenantSlug from an expired token', () => {
    const token = jwt.sign(
      {
        bookingId: BOOKING_ID,
        tenantId: TENANT_ID,
        tenantSlug: 'lava-car-test',
        contactEmail: CONTACT_EMAIL,
      },
      SECRET,
      { expiresIn: -1 },
    );
    expect(decodeUnverifiedTenantSlug(token)).toBe('lava-car-test');
  });

  it('returns null when tenantSlug is absent from the payload', () => {
    const token = makeToken();
    expect(decodeUnverifiedTenantSlug(token)).toBeNull();
  });

  it('returns null for a structurally malformed token', () => {
    expect(decodeUnverifiedTenantSlug('not-a-jwt-at-all')).toBeNull();
  });

  it('returns null for an empty string', () => {
    expect(decodeUnverifiedTenantSlug('')).toBeNull();
  });
});
