import { makeExecutionContext } from '../../../test/execution-context.factory';
import { GoogleAuthGuard } from './google-auth.guard';

describe('GoogleAuthGuard', () => {
  let guard: GoogleAuthGuard;

  beforeEach(() => {
    guard = new GoogleAuthGuard();
  });

  describe('getAuthenticateOptions() — customer login', () => {
    it('returns empty state when no tenantSlug is provided', () => {
      const opts = guard.getAuthenticateOptions(makeExecutionContext());
      expect(opts).toEqual({ state: '' });
    });

    it('returns state=<slug> when tenantSlug is provided', () => {
      const opts = guard.getAuthenticateOptions(
        makeExecutionContext({ query: { tenantSlug: 'lavacar-bh' } }),
      );
      expect(opts).toEqual({ state: 'lavacar-bh' });
    });

    it('ignores tenantSlug with invalid characters', () => {
      const opts = guard.getAuthenticateOptions(
        makeExecutionContext({ query: { tenantSlug: '../evil' } }),
      );
      expect(opts).toEqual({ state: '' });
    });
  });

  describe('getAuthenticateOptions() — staff login', () => {
    it('returns state=__staff__ for type=staff without tenantSlug (regular login)', () => {
      const opts = guard.getAuthenticateOptions(makeExecutionContext({ query: { type: 'staff' } }));
      expect(opts).toEqual({ state: '__staff__' });
    });

    it('returns state=__staff__:<slug> for type=staff with valid tenantSlug (first login)', () => {
      const opts = guard.getAuthenticateOptions(
        makeExecutionContext({ query: { type: 'staff', tenantSlug: 'lavacar-bh' } }),
      );
      expect(opts).toEqual({ state: '__staff__:lavacar-bh' });
    });

    it('falls back to state=__staff__ when tenantSlug has invalid characters', () => {
      const opts = guard.getAuthenticateOptions(
        makeExecutionContext({ query: { type: 'staff', tenantSlug: '../hack' } }),
      );
      expect(opts).toEqual({ state: '__staff__' });
    });

    it('falls back to state=__staff__ when tenantSlug is empty string', () => {
      const opts = guard.getAuthenticateOptions(
        makeExecutionContext({ query: { type: 'staff', tenantSlug: '' } }),
      );
      expect(opts).toEqual({ state: '__staff__' });
    });
  });
});
