import { describe, expect, it } from 'vitest';
import { ApiError, AuthError, ForbiddenError } from './errors';

describe('AuthError', () => {
  it('has name AuthError and is instanceof Error', () => {
    const err = new AuthError('not authenticated');
    expect(err.name).toBe('AuthError');
    expect(err.message).toBe('not authenticated');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(AuthError);
  });
});

describe('ForbiddenError', () => {
  it('has name ForbiddenError and is instanceof Error', () => {
    const err = new ForbiddenError('access denied');
    expect(err.name).toBe('ForbiddenError');
    expect(err.message).toBe('access denied');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(ForbiddenError);
  });
});

describe('ApiError', () => {
  it('has name ApiError, exposes status, and is instanceof Error', () => {
    const err = new ApiError(422, 'validation failed');
    expect(err.name).toBe('ApiError');
    expect(err.message).toBe('validation failed');
    expect(err.status).toBe(422);
    expect(err.detail).toBe('validation failed');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(ApiError);
  });
});
