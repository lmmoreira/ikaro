import { HttpException } from '@nestjs/common';
import { AuthErrorCode, BffErrorCode } from '@ikaro/types';
import { throwProblemDetail } from './problem-detail';

describe('throwProblemDetail', () => {
  it('throws an HttpException with the canonical ProblemDetail shape', () => {
    expect(() => throwProblemDetail(401, AuthErrorCode.UNAUTHORIZED, 'Valid JWT required')).toThrow(
      HttpException,
    );

    try {
      throwProblemDetail(401, AuthErrorCode.UNAUTHORIZED, 'Valid JWT required');
    } catch (err) {
      expect(err).toBeInstanceOf(HttpException);
      const httpErr = err as HttpException;
      expect(httpErr.getStatus()).toBe(401);
      expect(httpErr.getResponse()).toEqual({
        type: 'about:blank',
        title: 'Unauthorized',
        status: 401,
        code: AuthErrorCode.UNAUTHORIZED,
        detail: 'Valid JWT required',
      });
    }
  });

  it('includes field when provided', () => {
    try {
      throwProblemDetail(400, BffErrorCode.GUEST_TOKEN_MISSING, 'token is required', 'token');
    } catch (err) {
      expect((err as HttpException).getResponse()).toMatchObject({ field: 'token' });
    }
  });

  it('omits field when not provided', () => {
    try {
      throwProblemDetail(400, BffErrorCode.GUEST_TOKEN_MISSING, 'token is required');
    } catch (err) {
      expect((err as HttpException).getResponse()).not.toHaveProperty('field');
    }
  });

  it('falls back to a generic title for an uncatalogued status code', () => {
    try {
      throwProblemDetail(418, AuthErrorCode.INTERNAL_ERROR, "I'm a teapot");
    } catch (err) {
      expect((err as HttpException).getResponse()).toMatchObject({ title: 'Error' });
    }
  });
});
