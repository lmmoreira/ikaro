import { SignJWT } from 'jose';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { verifyCustomerToken, verifyStaffToken } from './verify-edge-jwt';

const TEST_SECRET = 'test-jwt-secret-64-chars-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx';
const FORGED_SECRET = 'a-different-attacker-controlled-secret-that-does-not-match-64c';

async function sign(
  claims: Record<string, unknown> & { exp?: number },
  secret: string,
): Promise<string> {
  const builder = new SignJWT(claims).setProtectedHeader({ alg: 'HS256' });
  if (claims.exp !== undefined) {
    builder.setExpirationTime(claims.exp);
  }
  return builder.sign(new TextEncoder().encode(secret));
}

beforeAll(() => {
  process.env.JWT_SECRET = TEST_SECRET;
});

afterEach(() => {
  vi.unstubAllEnvs();
});

const future = Math.floor(Date.now() / 1000) + 3600;
const past = Math.floor(Date.now() / 1000) - 60;

describe('verifyStaffToken', () => {
  it('accepts a STAFF token signed with the real secret', async () => {
    const token = await sign({ role: 'STAFF', exp: future }, TEST_SECRET);
    expect(await verifyStaffToken(token)).toEqual({ role: 'STAFF' });
  });

  it('accepts a MANAGER token signed with the real secret', async () => {
    const token = await sign({ role: 'MANAGER', exp: future }, TEST_SECRET);
    expect(await verifyStaffToken(token)).toEqual({ role: 'MANAGER' });
  });

  it('rejects a token with plausible claims but a forged signature (TD15)', async () => {
    const token = await sign({ role: 'MANAGER', exp: future }, FORGED_SECRET);
    expect(await verifyStaffToken(token)).toBeNull();
  });

  it('rejects a CUSTOMER-role token', async () => {
    const token = await sign({ role: 'CUSTOMER', exp: future }, TEST_SECRET);
    expect(await verifyStaffToken(token)).toBeNull();
  });

  it('rejects an expired token', async () => {
    const token = await sign({ role: 'STAFF', exp: past }, TEST_SECRET);
    expect(await verifyStaffToken(token)).toBeNull();
  });

  it('rejects a token with no exp claim', async () => {
    const token = await sign({ role: 'STAFF' }, TEST_SECRET);
    expect(await verifyStaffToken(token)).toBeNull();
  });

  it('rejects a malformed string', async () => {
    expect(await verifyStaffToken('not-a-jwt')).toBeNull();
  });
});

describe('verifyCustomerToken', () => {
  it('accepts a CUSTOMER token whose tenantSlug matches the URL slug', async () => {
    const token = await sign(
      { role: 'CUSTOMER', tenantSlug: 'lavacar-bh', exp: future },
      TEST_SECRET,
    );
    expect(await verifyCustomerToken(token, 'lavacar-bh')).toEqual({
      role: 'CUSTOMER',
      tenantSlug: 'lavacar-bh',
    });
  });

  it('rejects a token with plausible claims but a forged signature (TD15)', async () => {
    const token = await sign(
      { role: 'CUSTOMER', tenantSlug: 'lavacar-bh', exp: future },
      FORGED_SECRET,
    );
    expect(await verifyCustomerToken(token, 'lavacar-bh')).toBeNull();
  });

  it('rejects when tenantSlug does not match the URL slug', async () => {
    const token = await sign(
      { role: 'CUSTOMER', tenantSlug: 'another-tenant', exp: future },
      TEST_SECRET,
    );
    expect(await verifyCustomerToken(token, 'lavacar-bh')).toBeNull();
  });

  it('rejects a STAFF-role token', async () => {
    const token = await sign({ role: 'STAFF', tenantSlug: 'lavacar-bh', exp: future }, TEST_SECRET);
    expect(await verifyCustomerToken(token, 'lavacar-bh')).toBeNull();
  });

  it('rejects an expired token', async () => {
    const token = await sign(
      { role: 'CUSTOMER', tenantSlug: 'lavacar-bh', exp: past },
      TEST_SECRET,
    );
    expect(await verifyCustomerToken(token, 'lavacar-bh')).toBeNull();
  });
});
