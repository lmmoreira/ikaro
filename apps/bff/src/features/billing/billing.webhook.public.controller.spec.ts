import * as crypto from 'node:crypto';
import { HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { THROTTLER_SKIP } from '@nestjs/throttler/dist/throttler.constants';
import { makeBackendHttp } from '../../test/backend-http.mock';
import { IS_PUBLIC_KEY } from '../../shared/decorators/public.decorator';
import { BillingWebhookPublicController } from './billing.webhook.public.controller';

// Wraps the real function so the comparison still works while the call can be counted.
jest.mock('node:crypto', () => {
  const actual = jest.requireActual<typeof import('node:crypto')>('node:crypto');
  return { ...actual, timingSafeEqual: jest.fn(actual.timingSafeEqual) };
});

const TOKEN = 'asaas-webhook-token-for-tests';
const BODY = { id: 'evt_1&1', event: 'PAYMENT_RECEIVED', payment: { id: 'pay_1' } };

const configWith = (token: string | undefined): ConfigService =>
  ({ get: (key: string) => (key === 'ASAAS_WEBHOOK_TOKEN' ? token : undefined) }) as ConfigService;

describe('BillingWebhookPublicController', () => {
  const handler = BillingWebhookPublicController.prototype.receiveAsaas;

  it('is public, unthrottled and answers exactly 200', () => {
    const reflector = new Reflector();

    expect(reflector.get(IS_PUBLIC_KEY, handler)).toBe(true);
    expect(Reflect.getMetadata(`${THROTTLER_SKIP}default`, handler)).toBe(true);
    expect(Reflect.getMetadata('__httpCode__', handler)).toBe(HttpStatus.OK);
  });

  it('forwards the parsed body to the internal route through the tenant-less call when the token matches', async () => {
    const backend = makeBackendHttp();
    backend.postWithoutTenant.mockResolvedValueOnce(undefined);
    const controller = new BillingWebhookPublicController(backend, configWith(TOKEN));

    await expect(controller.receiveAsaas(TOKEN, BODY)).resolves.toBeUndefined();

    expect(backend.postWithoutTenant).toHaveBeenCalledWith(
      '/internal/billing/webhooks/asaas',
      BODY,
    );
  });

  it.each([
    ['a wrong token', 'not-the-token'],
    ['a token of another length', 'x'],
    ['a missing token', undefined],
  ])('answers 401 and calls no backend for %s', async (_label, received) => {
    const backend = makeBackendHttp();
    const controller = new BillingWebhookPublicController(backend, configWith(TOKEN));

    const thrown = await controller.receiveAsaas(received, BODY).catch((err: unknown) => err);

    expect(thrown).toBeInstanceOf(HttpException);
    expect((thrown as HttpException).getStatus()).toBe(HttpStatus.UNAUTHORIZED);
    expect(backend.postWithoutTenant).not.toHaveBeenCalled();
  });

  it('fails closed when ASAAS_WEBHOOK_TOKEN is unset: even a request with a token is refused and calls no backend', async () => {
    const backend = makeBackendHttp();
    const controller = new BillingWebhookPublicController(backend, configWith(undefined));

    const thrown = await controller.receiveAsaas('anything', BODY).catch((err: unknown) => err);

    expect((thrown as HttpException).getStatus()).toBe(HttpStatus.UNAUTHORIZED);
    expect(backend.postWithoutTenant).not.toHaveBeenCalled();
  });

  it('compares the token with crypto.timingSafeEqual, never ===', async () => {
    const spy = crypto.timingSafeEqual as jest.Mock;
    spy.mockClear();
    const backend = makeBackendHttp();
    backend.postWithoutTenant.mockResolvedValueOnce(undefined);

    await new BillingWebhookPublicController(backend, configWith(TOKEN)).receiveAsaas(TOKEN, BODY);

    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('lets a backend failure through as non-2xx, so the provider retries', async () => {
    const backend = makeBackendHttp();
    backend.postWithoutTenant.mockRejectedValueOnce(
      new HttpException({ title: 'Unavailable' }, HttpStatus.SERVICE_UNAVAILABLE),
    );
    const controller = new BillingWebhookPublicController(backend, configWith(TOKEN));

    const thrown = await controller.receiveAsaas(TOKEN, BODY).catch((err: unknown) => err);

    expect((thrown as HttpException).getStatus()).toBe(HttpStatus.SERVICE_UNAVAILABLE);
  });
});
