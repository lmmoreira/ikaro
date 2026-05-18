import { Request } from 'express';
import { GoogleProfile, GoogleStrategy } from './google.strategy';

function makeReq(state?: string): Request {
  return { query: { state } } as unknown as Request;
}

describe('GoogleStrategy', () => {
  let strategy: GoogleStrategy;

  beforeEach(() => {
    process.env['GOOGLE_CLIENT_ID'] = 'test-client-id';
    process.env['GOOGLE_CLIENT_SECRET'] = 'test-client-secret';
    process.env['GOOGLE_CALLBACK_URL'] = 'http://localhost:3002/v1/auth/google/callback';
    strategy = new GoogleStrategy();
  });

  it('validate() maps Google profile fields correctly', (done) => {
    const profile = {
      id: 'google-sub-123',
      displayName: 'João Silva',
      emails: [{ value: 'joao@lavacar.com.br' }],
    };

    strategy.validate(makeReq(), 'access-token', 'refresh-token', profile as never, (err, user) => {
      expect(err).toBeNull();
      expect(user).toEqual<GoogleProfile>({
        googleOAuthId: 'google-sub-123',
        email: 'joao@lavacar.com.br',
        name: 'João Silva',
        tenantSlug: undefined,
      });
      done();
    });
  });

  it('validate() includes tenantSlug when OAuth state is present', (done) => {
    const profile = {
      id: 'google-sub-123',
      displayName: 'João Silva',
      emails: [{ value: 'joao@lavacar.com.br' }],
    };

    strategy.validate(
      makeReq('lavacar-bh'),
      'access-token',
      'refresh-token',
      profile as never,
      (err, user) => {
        expect(err).toBeNull();
        expect(user?.tenantSlug).toBe('lavacar-bh');
        done();
      },
    );
  });

  it('validate() calls done with error when profile has no emails', (done) => {
    strategy.validate(
      makeReq(),
      'access-token',
      'refresh-token',
      { id: 'x', displayName: 'Y', emails: [] } as never,
      (err) => {
        expect(err).toBeInstanceOf(Error);
        done();
      },
    );
  });
});
