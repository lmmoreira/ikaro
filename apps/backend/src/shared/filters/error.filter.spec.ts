import { ArgumentsHost } from '@nestjs/common';
import { BaseErrorFilter } from '@ikaro/nestjs-http';
import { AuthErrorCode } from '@ikaro/types';
import { ErrorFilter } from './error.filter';
import {
  DEADLOCK_DETECTED_SQLSTATE,
  LOCK_NOT_AVAILABLE_SQLSTATE,
  TransactionContentionError,
} from '../infrastructure/transaction-contention.error';

function makeHost() {
  const json = jest.fn();
  const set = jest.fn();
  const status = jest.fn(() => ({ json }));
  const host = {
    switchToHttp: () => ({
      getRequest: () => ({ path: '/v1/bookings', method: 'POST', headers: {} }),
      getResponse: () => ({ status, set }),
    }),
  } as unknown as ArgumentsHost;
  return { host, status, json, set };
}

describe('ErrorFilter', () => {
  it('wires the backend AppLogger into the shared BaseErrorFilter', () => {
    const filter = new ErrorFilter();
    expect(filter).toBeInstanceOf(BaseErrorFilter);
  });

  it.each([LOCK_NOT_AVAILABLE_SQLSTATE, DEADLOCK_DETECTED_SQLSTATE] as const)(
    'renders a TransactionContentionError (%s) as a 503 with Retry-After and the contention code, and no driver text',
    (sqlState) => {
      const { host, status, json, set } = makeHost();
      const error = new TransactionContentionError(
        sqlState,
        new Error('deadlock detected: SELECT * FROM booking.bookings WHERE tenant_id = tenant-b'),
      );

      new ErrorFilter().catch(error, host);

      expect(status).toHaveBeenCalledWith(503);
      expect(set).toHaveBeenCalledWith('Retry-After', '1');
      expect(set).toHaveBeenCalledWith('Content-Type', 'application/problem+json');
      const body = json.mock.calls[0][0] as Record<string, unknown>;
      expect(body).toMatchObject({
        status: 503,
        title: 'Service Unavailable',
        code: AuthErrorCode.TRANSACTION_CONTENTION,
      });
      expect(JSON.stringify(body)).not.toMatch(/SELECT|booking\.bookings|tenant-b|deadlock/i);
    },
  );

  it('still renders any other unhandled error as a 500 without Retry-After', () => {
    const { host, status, set } = makeHost();

    new ErrorFilter().catch(new Error('boom'), host);

    expect(status).toHaveBeenCalledWith(500);
    expect(set).not.toHaveBeenCalledWith('Retry-After', expect.anything());
  });
});
