import { describe, expect, it } from 'vitest';
import { ApiError } from '@/shared/lib/api/errors';
import { assertEntryRescheduled } from './scheduling-exception-reschedule';

describe('assertEntryRescheduled', () => {
  it('returns when the entry was resolved', () => {
    expect(() =>
      assertEntryRescheduled({ results: [{ exceptionId: 'exc-1', outcome: 'RESOLVED' }] }, 'exc-1'),
    ).not.toThrow();
  });

  it('turns the slot-unavailable STILL_OPEN into the 409 the reschedule page already understands', () => {
    const run = () =>
      assertEntryRescheduled(
        {
          results: [
            { exceptionId: 'exc-1', outcome: 'STILL_OPEN', errorCode: 'BOOKING_SLOT_UNAVAILABLE' },
          ],
        },
        'exc-1',
      );

    expect(run).toThrow(ApiError);
    try {
      run();
    } catch (err) {
      expect((err as ApiError).status).toBe(409);
      expect((err as ApiError).data).toEqual({ code: 'BOOKING_SLOT_UNAVAILABLE' });
    }
  });

  it('turns any other STILL_OPEN into an error that carries its code (translated by the page)', () => {
    try {
      assertEntryRescheduled(
        {
          results: [
            {
              exceptionId: 'exc-1',
              outcome: 'STILL_OPEN',
              errorCode: 'BOOKING_EXCEPTION_ALREADY_RESOLVED',
            },
          ],
        },
        'exc-1',
      );
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      expect((err as ApiError).status).toBe(422);
      expect((err as ApiError).data).toEqual({ code: 'BOOKING_EXCEPTION_ALREADY_RESOLVED' });
    }
  });

  it('treats a missing result for the entry as not resolved', () => {
    expect(() => assertEntryRescheduled({ results: [] }, 'exc-1')).toThrow(ApiError);
  });
});
