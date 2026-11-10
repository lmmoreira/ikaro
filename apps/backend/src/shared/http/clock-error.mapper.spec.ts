import { HttpException } from '@nestjs/common';
import { GenericErrorCode } from '@ikaro/types';
import { ClockAdvanceOutOfRangeError } from '../domain/clock-advance-out-of-range.error';
import { mapClockError } from './clock-error.mapper';

describe('mapClockError', () => {
  it('maps ClockAdvanceOutOfRangeError to 400 GENERIC_VALUE_OUT_OF_RANGE', () => {
    let thrown: unknown;
    try {
      mapClockError(new ClockAdvanceOutOfRangeError('too far'));
    } catch (e) {
      thrown = e;
    }

    expect(thrown).toBeInstanceOf(HttpException);
    const http = thrown as HttpException;
    expect(http.getStatus()).toBe(400);
    expect(http.getResponse()).toMatchObject({ code: GenericErrorCode.VALUE_OUT_OF_RANGE });
  });

  it('rethrows any other error unchanged', () => {
    const err = new RangeError('boom');

    expect(() => mapClockError(err)).toThrow(err);
  });
});
