import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { GoogleProfile, GoogleStrategy } from './google.strategy';

function makeReq(state?: string): Request {
  return { query: { state } } as unknown as Request;
}

function makeConfigService(): ConfigService {
  return {
    getOrThrow: jest.fn().mockImplementation((key: string) => {
      if (key === 'GOOGLE_CLIENT_ID') return 'test-client-id';
      if (key === 'GOOGLE_CLIENT_SECRET') return 'test-client-secret';
      if (key === 'GOOGLE_CALLBACK_URL') return 'http://localhost:3002/v1/auth/google/callback';
      return '';
    }),
  } as unknown as ConfigService;
}

describe('GoogleStrategy', () => {
  let strategy: GoogleStrategy;

  beforeEach(() => {
    strategy = new GoogleStrategy(makeConfigService());
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

  it('validate() includes tenantSlug when OAuth state is a slug', (done) => {
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
        expect(user?.loginType).toBeUndefined();
        done();
      },
    );
  });

  it('validate() sets loginType=staff with tenantSlug when state=__staff__:<slug>', (done) => {
    const profile = {
      id: 'google-sub-staff',
      displayName: 'Carlos Gerente',
      emails: [{ value: 'gerente@lavacar.com.br' }],
    };

    strategy.validate(
      makeReq('__staff__:lavacar-bh'),
      'access-token',
      'refresh-token',
      profile as never,
      (err, user) => {
        expect(err).toBeNull();
        expect(user?.loginType).toBe('staff');
        expect(user?.tenantSlug).toBe('lavacar-bh');
        done();
      },
    );
  });

  it('validate() sets loginType=staff and clears tenantSlug when state=__staff__', (done) => {
    const profile = {
      id: 'google-sub-staff',
      displayName: 'Carlos Gerente',
      emails: [{ value: 'gerente@lavacar.com.br' }],
    };

    strategy.validate(
      makeReq('__staff__'),
      'access-token',
      'refresh-token',
      profile as never,
      (err, user) => {
        expect(err).toBeNull();
        expect(user?.loginType).toBe('staff');
        expect(user?.tenantSlug).toBeUndefined();
        done();
      },
    );
  });

  it('validate() treats a slug named "staff" as a tenant slug, not staff login', (done) => {
    const profile = {
      id: 'google-sub-123',
      displayName: 'João Silva',
      emails: [{ value: 'joao@lavacar.com.br' }],
    };

    strategy.validate(
      makeReq('staff'),
      'access-token',
      'refresh-token',
      profile as never,
      (err, user) => {
        expect(err).toBeNull();
        expect(user?.loginType).toBeUndefined();
        expect(user?.tenantSlug).toBe('staff');
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
