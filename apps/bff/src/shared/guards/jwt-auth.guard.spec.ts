import { HttpException, HttpStatus } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthErrorCode } from '@ikaro/types';
import { makeExecutionContext } from '../../test/execution-context.factory';
import { JwtAuthGuard } from './jwt-auth.guard';

describe('JwtAuthGuard', () => {
  let guard: JwtAuthGuard;
  let reflector: Reflector;

  beforeEach(() => {
    reflector = new Reflector();
    guard = new JwtAuthGuard(reflector);
  });

  describe('canActivate()', () => {
    it('returns true immediately for @Public() routes without calling super', () => {
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(true);
      const result = guard.canActivate(makeExecutionContext());
      expect(result).toBe(true);
    });
  });

  describe('handleRequest()', () => {
    it('returns the user when no error and user is present', () => {
      const user = { sub: 'uuid-1', tenantId: 'tid', tenantSlug: 'slug', role: 'CUSTOMER' };
      expect(guard.handleRequest(null, user)).toBe(user);
    });

    it('throws 401 HttpException when user is null (no/invalid token)', () => {
      expect(() => guard.handleRequest(null, null)).toThrow(HttpException);
      try {
        guard.handleRequest(null, null);
      } catch (e) {
        expect((e as HttpException).getStatus()).toBe(HttpStatus.UNAUTHORIZED);
        const body = (e as HttpException).getResponse() as Record<string, unknown>;
        expect(body['status']).toBe(401);
        expect(body['title']).toBe('Unauthorized');
        expect(body['code']).toBe(AuthErrorCode.UNAUTHORIZED);
      }
    });

    it('throws 401 HttpException when an error is passed (expired/tampered token)', () => {
      expect(() => guard.handleRequest(new Error('jwt expired'), null)).toThrow(HttpException);
      try {
        guard.handleRequest(new Error('jwt expired'), null);
      } catch (e) {
        expect((e as HttpException).getStatus()).toBe(HttpStatus.UNAUTHORIZED);
        const body = (e as HttpException).getResponse() as Record<string, unknown>;
        expect(body['code']).toBe(AuthErrorCode.UNAUTHORIZED);
      }
    });
  });
});
