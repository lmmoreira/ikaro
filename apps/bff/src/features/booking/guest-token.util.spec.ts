import * as jwt from 'jsonwebtoken';
import { verifyGuestToken } from './guest-token.util';

const SECRET = 'test-secret-must-be-at-least-64-chars-long-xxxxxxxxxxxxxxxxxxxxxxxxxxxx';
const BOOKING_ID = '40000000-0000-4000-8000-000000000001';
const TENANT_ID = '10000000-0000-4000-8000-000000000001';
const CONTACT_EMAIL = 'guest@example.com';

function makeToken(overrides: Record<string, unknown> = {}): string {
  return jwt.sign(
    { bookingId: BOOKING_ID, tenantId: TENANT_ID, contactEmail: CONTACT_EMAIL, ...overrides },
    SECRET,
  );
}

describe('verifyGuestToken()', () => {
  it('returns payload for a valid token', () => {
    const token = makeToken();
    const result = verifyGuestToken(token, SECRET);
    expect(result).toMatchObject({ bookingId: BOOKING_ID });
  });

  it('returns false for an invalid signature', () => {
    const token = makeToken();
    expect(
      verifyGuestToken(token, 'wrong-secret-64-chars-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'),
    ).toBe(false);
  });

  it('returns false for an expired token', () => {
    const token = jwt.sign(
      { bookingId: BOOKING_ID, tenantId: TENANT_ID, contactEmail: CONTACT_EMAIL },
      SECRET,
      { expiresIn: -1 },
    );
    expect(verifyGuestToken(token, SECRET)).toBe(false);
  });

  it('returns false when token is valid but payload does not match guest schema', () => {
    const token = jwt.sign({ sub: 'user-id', tenantId: TENANT_ID, role: 'CUSTOMER' }, SECRET);
    expect(verifyGuestToken(token, SECRET)).toBe(false);
  });
});
