import { HttpException, HttpStatus } from '@nestjs/common';
import { GenericErrorCode } from '@ikaro/types';
import { throwProblemDetail } from './problem-detail';

describe('throwProblemDetail', () => {
  it('throws an HttpException carrying the RFC 9457 envelope', () => {
    let err: unknown;
    try {
      throwProblemDetail(HttpStatus.BAD_REQUEST, GenericErrorCode.FIELD_REQUIRED, 'x is required', 'x');
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(HttpException);
    expect((err as HttpException).getStatus()).toBe(HttpStatus.BAD_REQUEST);
    expect((err as HttpException).getResponse()).toEqual({
      type: 'about:blank',
      title: 'Bad Request',
      status: HttpStatus.BAD_REQUEST,
      code: GenericErrorCode.FIELD_REQUIRED,
      detail: 'x is required',
      field: 'x',
    });
  });

  it('omits code and field when not provided', () => {
    let err: unknown;
    try {
      throwProblemDetail(HttpStatus.FORBIDDEN, undefined, 'MANAGER role required');
    } catch (e) {
      err = e;
    }
    expect((err as HttpException).getResponse()).toEqual({
      type: 'about:blank',
      title: 'Forbidden',
      status: HttpStatus.FORBIDDEN,
      detail: 'MANAGER role required',
    });
  });

  it('falls back to a generic title for an uncatalogued status', () => {
    let err: unknown;
    try {
      throwProblemDetail(418, undefined, "I'm a teapot");
    } catch (e) {
      err = e;
    }
    expect((err as HttpException).getResponse()).toMatchObject({ title: 'Error' });
  });
});
