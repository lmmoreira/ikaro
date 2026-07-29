import * as jwt from 'jsonwebtoken';
import { decodeUserJwt, tryDecodeRawJwt } from './decode-user-jwt';

const SECRET = 'test-secret-must-be-at-least-64-chars-long-xxxxxxxxxxxxxxxxxxxxxxxxxxxx';
const TENANT_ID = '10000000-0000-4000-8000-000000000001';
const TENANT_SLUG = 'lavacar-bh';

describe('tryDecodeRawJwt()', () => {
  it('returns the decoded payload for a valid token', () => {
    const token = jwt.sign({ sub: 'user-id' }, SECRET);
    expect(tryDecodeRawJwt(token, SECRET)).toMatchObject({ sub: 'user-id' });
  });

  it('returns null for an invalid signature', () => {
    const token = jwt.sign({ sub: 'user-id' }, SECRET);
    expect(
      tryDecodeRawJwt(token, 'wrong-secret-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'),
    ).toBeNull();
  });

  it('returns null for an expired token', () => {
    const token = jwt.sign({ sub: 'user-id' }, SECRET, { expiresIn: -1 });
    expect(tryDecodeRawJwt(token, SECRET)).toBeNull();
  });
});

describe('decodeUserJwt()', () => {
  it('returns null when authHeader is undefined', () => {
    expect(decodeUserJwt(undefined, SECRET)).toBeNull();
  });

  it('returns null when authHeader does not start with "Bearer "', () => {
    expect(decodeUserJwt('Basic abc123', SECRET)).toBeNull();
  });

  it('returns the decoded CurrentUserPayload for a valid CUSTOMER token', () => {
    const token = jwt.sign(
      {
        sub: 'cust-id',
        tenantId: TENANT_ID,
        tenantSlug: TENANT_SLUG,
        tenantName: 'Lava Car BH',
        userName: 'Jane Doe',
        role: 'CUSTOMER',
        locale: 'pt-BR',
      },
      SECRET,
    );

    expect(decodeUserJwt(`Bearer ${token}`, SECRET)).toEqual({
      sub: 'cust-id',
      tenantId: TENANT_ID,
      tenantSlug: TENANT_SLUG,
      tenantName: 'Lava Car BH',
      userName: 'Jane Doe',
      role: 'CUSTOMER',
      locale: 'pt-BR',
    });
  });

  it('defaults tenantName to empty string, userName to null, and locale to pt-BR when absent', () => {
    const token = jwt.sign(
      { sub: 'staff-id', tenantId: TENANT_ID, tenantSlug: TENANT_SLUG, role: 'STAFF' },
      SECRET,
    );

    expect(decodeUserJwt(`Bearer ${token}`, SECRET)).toMatchObject({
      tenantName: '',
      userName: null,
      locale: 'pt-BR',
    });
  });

  it('returns null for an invalid signature', () => {
    const token = jwt.sign(
      { sub: 'cust-id', tenantId: TENANT_ID, tenantSlug: TENANT_SLUG, role: 'CUSTOMER' },
      SECRET,
    );
    expect(
      decodeUserJwt(`Bearer ${token}`, 'wrong-secret-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'),
    ).toBeNull();
  });

  it('returns null when role is not one of CUSTOMER/STAFF/MANAGER', () => {
    const token = jwt.sign(
      { sub: 'cust-id', tenantId: TENANT_ID, tenantSlug: TENANT_SLUG, role: 'SUPERADMIN' },
      SECRET,
    );
    expect(decodeUserJwt(`Bearer ${token}`, SECRET)).toBeNull();
  });

  it('returns null when the payload does not match CurrentUserPayload shape (e.g. a guest token)', () => {
    const guestShapedToken = jwt.sign(
      {
        bookingId: '40000000-0000-4000-8000-000000000001',
        tenantId: TENANT_ID,
        contactEmail: 'g@test.com',
      },
      SECRET,
    );
    expect(decodeUserJwt(`Bearer ${guestShapedToken}`, SECRET)).toBeNull();
  });
});
