import { describe, expect, it } from 'vitest';
import { ApiError, AuthError, FetchError, ForbiddenError, parseErrorBody } from './errors';

describe('parseErrorBody', () => {
  it('extracts code/field/violations/detail from a JSON error body', async () => {
    const res = new Response(
      JSON.stringify({ code: 'BOOKING_NOT_FOUND', field: 'bookingId', detail: 'not found' }),
    );
    await expect(parseErrorBody(res)).resolves.toEqual({
      code: 'BOOKING_NOT_FOUND',
      field: 'bookingId',
      detail: 'not found',
    });
  });

  it('resolves to an empty object when the body is not valid JSON', async () => {
    const res = new Response('not json');
    await expect(parseErrorBody(res)).resolves.toEqual({});
  });

  it('resolves to an empty object when the body is empty', async () => {
    const res = new Response('');
    await expect(parseErrorBody(res)).resolves.toEqual({});
  });
});

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

describe('FetchError', () => {
  it('exposes status/code/field and falls back to a generic message when no detail is given', () => {
    const err = new FetchError(404, 'BOOKING_NOT_FOUND', 'bookingId');
    expect(err.status).toBe(404);
    expect(err.code).toBe('BOOKING_NOT_FOUND');
    expect(err.field).toBe('bookingId');
    expect(err.message).toBe('Request failed (404)');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(FetchError);
  });

  it('uses the provided detail as the message when given', () => {
    const err = new FetchError(400, 'GENERIC_FIELD_REQUIRED', 'phone', 'Phone is required.');
    expect(err.message).toBe('Phone is required.');
  });

  it('a subclass keeps its own name and passes instanceof for both itself and FetchError', () => {
    class ExampleFetchError extends FetchError {
      constructor(status: number) {
        super(status);
        this.name = 'ExampleFetchError';
      }
    }
    const err = new ExampleFetchError(500);
    expect(err.name).toBe('ExampleFetchError');
    expect(err).toBeInstanceOf(ExampleFetchError);
    expect(err).toBeInstanceOf(FetchError);
    expect(err).toBeInstanceOf(Error);
  });
});
