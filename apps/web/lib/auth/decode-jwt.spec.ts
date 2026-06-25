import { describe, expect, it } from 'vitest';
import { decodeJwtPayload } from './decode-jwt';

function makeToken(payload: object): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${header}.${body}.fake-signature`;
}

describe('decodeJwtPayload', () => {
  it('decodes the payload segment without verifying the signature', () => {
    const token = makeToken({
      sub: 'c-1',
      tenantId: 't-1',
      tenantSlug: 'lavacar-bh',
      role: 'CUSTOMER',
    });

    expect(decodeJwtPayload(token)).toEqual({
      sub: 'c-1',
      tenantId: 't-1',
      tenantSlug: 'lavacar-bh',
      role: 'CUSTOMER',
    });
  });

  it('returns an empty object for a malformed token', () => {
    expect(decodeJwtPayload('not-a-jwt')).toEqual({});
  });

  it('returns an empty object for a token with invalid base64/JSON in the payload', () => {
    expect(decodeJwtPayload('header.%%%not-base64%%%.sig')).toEqual({});
  });
});
