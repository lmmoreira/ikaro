import { HttpException, HttpStatus } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { FEATURE_KEYS } from '@ikaro/validation';
import { NO_FEATURE_GATE_KEY } from '../../shared/decorators/no-feature-gate.decorator';
import { SUSPENSION_ACCESS_KEY } from '../../shared/decorators/suspension-access.decorator';
import { makeBackendHttp } from '../../test/backend-http.mock';
import type { CurrentUserPayload } from '../../shared/decorators/current-user.decorator';
import { BillingController } from './billing.controller';

const TENANT_ID = '10000000-0000-4000-8000-000000000001';

const user = (role: CurrentUserPayload['role']): CurrentUserPayload => ({
  sub: '30000000-0000-4000-8000-000000000001',
  tenantId: TENANT_ID,
  tenantSlug: 'lavacar-bh',
  tenantName: 'Lavacar BH',
  userName: null,
  role,
  locale: 'pt-BR',
});

const BACKEND_ANSWER = {
  status: 'SUSPENDED',
  suspensionReason: 'NON_PAYMENT',
  operational: false,
  features: [],
};

describe('BillingController', () => {
  it('declares the access read reachable while a tenant is suspended, so the web can learn that it is', () => {
    const reflector = new Reflector();
    const handler = BillingController.prototype.getAccess;

    expect(reflector.get(NO_FEATURE_GATE_KEY, handler)).toBe(true);
    expect(reflector.get(SUSPENSION_ACCESS_KEY, handler)).toBe('ANY_AUTHENTICATED');
  });

  it('reads the access of the tenant in the JWT from the backend internal endpoint', async () => {
    const backendHttp = makeBackendHttp();
    backendHttp.get.mockResolvedValueOnce(BACKEND_ANSWER);

    await new BillingController(backendHttp).getAccess(user('MANAGER'));

    expect(backendHttp.get).toHaveBeenCalledWith(`/internal/billing/tenants/${TENANT_ID}/access`);
  });

  it('reduces the answer by role and never forwards the suspension reason', async () => {
    const backendHttp = makeBackendHttp();
    backendHttp.get.mockResolvedValue(BACKEND_ANSWER);
    const controller = new BillingController(backendHttp);

    await expect(controller.getAccess(user('MANAGER'))).resolves.toEqual({
      status: 'SUSPENDED',
      operational: false,
      features: [],
    });
    await expect(controller.getAccess(user('STAFF'))).resolves.toEqual({
      operational: false,
      features: [],
    });
    await expect(controller.getAccess(user('CUSTOMER'))).resolves.toEqual({ operational: false });
  });

  it('fails open on a backend outage (5xx or network), with every feature', async () => {
    const backendHttp = makeBackendHttp();
    backendHttp.get.mockRejectedValueOnce(
      new HttpException('down', HttpStatus.SERVICE_UNAVAILABLE),
    );
    backendHttp.get.mockRejectedValueOnce(new Error('ECONNRESET'));
    const controller = new BillingController(backendHttp);

    const viaHttpError = await controller.getAccess(user('MANAGER'));
    const viaNetworkError = await controller.getAccess(user('STAFF'));

    expect(viaHttpError).toMatchObject({ status: 'ACTIVE', operational: true });
    expect((viaHttpError as { features: unknown[] }).features).toHaveLength(FEATURE_KEYS.length);
    expect(viaNetworkError).toMatchObject({ operational: true });
  });

  it('fails open when the backend answer has an unexpected shape', async () => {
    const backendHttp = makeBackendHttp();
    backendHttp.get.mockResolvedValueOnce({ unexpected: true });

    await expect(new BillingController(backendHttp).getAccess(user('CUSTOMER'))).resolves.toEqual({
      operational: true,
    });
  });

  it('does not swallow a 4xx (an unknown tenant is a real answer, never fail-open)', async () => {
    const backendHttp = makeBackendHttp();
    backendHttp.get.mockRejectedValueOnce(new HttpException('not found', HttpStatus.NOT_FOUND));

    await expect(new BillingController(backendHttp).getAccess(user('MANAGER'))).rejects.toThrow(
      HttpException,
    );
  });
});
