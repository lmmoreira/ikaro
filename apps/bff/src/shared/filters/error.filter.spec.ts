import { HttpService } from '@nestjs/axios';
import { ArgumentsHost } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BaseErrorFilter } from '@ikaro/nestjs-http';
import { AuthErrorCode } from '@ikaro/types';
import { AxiosError, AxiosResponse } from 'axios';
import { Request } from 'express';
import { throwError } from 'rxjs';
import { BackendHttpService } from '../http/backend-http.service';
import { ErrorFilter } from './error.filter';

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
  it('wires the BFF AppLogger into the shared BaseErrorFilter', () => {
    const filter = new ErrorFilter();
    expect(filter).toBeInstanceOf(BaseErrorFilter);
  });

  // M23-S49: the backend answers a lock timeout or a deadlock abort with a 503 problem. The BFF
  // re-throws a backend error as a plain HttpException (status and body only, no headers), so the
  // header the client needs has to be set by this filter, not carried over from the backend.
  it('a backend 503 contention problem leaves the BFF as a 503 with the same code and Retry-After', async () => {
    const backendBody = {
      type: 'about:blank',
      title: 'Service Unavailable',
      status: 503,
      code: AuthErrorCode.TRANSACTION_CONTENTION,
      detail: 'The request was aborted by lock contention; retry shortly',
    };
    const http = {
      post: jest.fn().mockReturnValue(
        throwError(() =>
          Object.assign(new AxiosError('Request failed with status code 503'), {
            response: { status: 503, data: backendBody } as AxiosResponse,
          }),
        ),
      ),
    };
    const config = {
      getOrThrow: (key: string) => (key === 'BACKEND_INTERNAL_URL' ? 'http://backend:3001' : 'k'),
    } as unknown as ConfigService;
    const backend = new BackendHttpService(http as unknown as HttpService, config, {
      headers: {},
    } as unknown as Request);
    const thrown = await backend.post('/v1/bookings', {}).catch((e: unknown) => e);
    const { host, status, json, set } = makeHost();

    new ErrorFilter().catch(thrown, host);

    expect(status).toHaveBeenCalledWith(503);
    expect(set).toHaveBeenCalledWith('Retry-After', '1');
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ status: 503, code: AuthErrorCode.TRANSACTION_CONTENTION }),
    );
  });
});
