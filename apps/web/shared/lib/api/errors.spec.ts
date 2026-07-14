import { describe, expect, it } from 'vitest';
import {
  ApiError,
  AuthError,
  assertOk,
  FetchError,
  ForbiddenError,
  parseErrorBody,
} from './errors';

describe('parseErrorBody', () => {
  it('extracts code/field/violations/detail from a JSON error body', async () => {
    const res = new Response(
      JSON.stringify({
        code: 'BOOKING_NOT_FOUND',
        field: 'bookingId',
        detail: 'not found',
        violations: [{ field: 'bookingId', code: 'GENERIC_FIELD_REQUIRED' }],
      }),
    );
    await expect(parseErrorBody(res)).resolves.toEqual({
      code: 'BOOKING_NOT_FOUND',
      field: 'bookingId',
      detail: 'not found',
      violations: [{ field: 'bookingId', code: 'GENERIC_FIELD_REQUIRED' }],
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

  it('exposes the response body via data', () => {
    const body = { code: 'STAFF_SELF_DEACTIVATION' };
    const err = new ForbiddenError('access denied', body);
    expect(err.data).toBe(body);
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
  it('exposes status/code/field/detail as separate properties, keeping detail out of message', () => {
    const err = new FetchError(
      'Request failed',
      404,
      'BOOKING_NOT_FOUND',
      'bookingId',
      'raw backend detail',
    );
    expect(err.status).toBe(404);
    expect(err.code).toBe('BOOKING_NOT_FOUND');
    expect(err.field).toBe('bookingId');
    expect(err.detail).toBe('raw backend detail');
    expect(err.message).toBe('Request failed');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(FetchError);
  });

  it('a subclass keeps its own name and passes instanceof for both itself and FetchError', () => {
    class ExampleFetchError extends FetchError {
      constructor(status: number) {
        super(`Example failed (${status})`, status);
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

describe('assertOk', () => {
  class ExampleFetchError extends FetchError {
    constructor(status: number, code?: string, field?: string, detail?: string) {
      super(`Example request failed (${status})`, status, code, field, detail);
      this.name = 'ExampleFetchError';
    }
  }

  it('resolves without throwing when the response is ok', async () => {
    await expect(
      assertOk(new Response(null, { status: 200 }), ExampleFetchError),
    ).resolves.toBeUndefined();
  });

  it('throws the given error class populated from the response body on failure', async () => {
    const res = new Response(
      JSON.stringify({
        code: 'GENERIC_FIELD_REQUIRED',
        field: 'phone',
        detail: 'Phone is required.',
      }),
      { status: 400 },
    );
    await expect(assertOk(res, ExampleFetchError)).rejects.toMatchObject({
      status: 400,
      code: 'GENERIC_FIELD_REQUIRED',
      field: 'phone',
      detail: 'Phone is required.',
    });
    await expect(
      assertOk(
        new Response(
          JSON.stringify({
            code: 'GENERIC_FIELD_REQUIRED',
            field: 'phone',
            detail: 'Phone is required.',
          }),
          { status: 400 },
        ),
        ExampleFetchError,
      ),
    ).rejects.toBeInstanceOf(ExampleFetchError);
  });
});
