import { HttpException } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { of, throwError } from 'rxjs';
import { HealthController } from './health.controller';

const BACKEND_URL = 'http://backend:3001';

function makeHttp(shouldFail: boolean): HttpService {
  return {
    get: jest
      .fn()
      .mockReturnValue(shouldFail ? throwError(() => new Error('ECONNREFUSED')) : of({ data: {} })),
  } as unknown as HttpService;
}

function makeConfig(): ConfigService {
  return {
    getOrThrow: jest.fn().mockReturnValue(BACKEND_URL),
  } as unknown as ConfigService;
}

describe('HealthController', () => {
  it('returns ok for live without calling the backend', () => {
    const http = makeHttp(false);
    const controller = new HealthController(http, makeConfig());

    expect(controller.live()).toEqual({ status: 'ok' });
    expect(http.get).not.toHaveBeenCalled();
  });

  it('ready() returns ok when the backend readiness check succeeds', async () => {
    const http = makeHttp(false);
    const controller = new HealthController(http, makeConfig());

    await expect(controller.ready()).resolves.toEqual({ status: 'ok' });
    expect(http.get).toHaveBeenCalledWith(`${BACKEND_URL}/health/ready`, { timeout: 2000 });
  });

  it('ready() throws a 503 when the backend is unreachable or not ready', async () => {
    const http = makeHttp(true);
    const controller = new HealthController(http, makeConfig());

    const rejection = await controller.ready().catch((err: unknown) => err);

    expect(rejection).toBeInstanceOf(HttpException);
    expect(rejection).toMatchObject({ status: 503 });
  });
});
