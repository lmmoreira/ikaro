import { HttpException, HttpStatus } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { REQUIRES_FEATURE_KEY, SUSPENSION_ACCESS_KEY } from '@ikaro/nestjs-http';
import { FEATURE_KEYS } from '@ikaro/validation';
import { makeBackendHttp } from '../../test/backend-http.mock';
import {
  BillingChargeHistoryItemBuilder,
  BillingSummaryBuilder,
} from '../../test/builders/billing-summary.builder';
import { ROLES_KEY } from '../../shared/decorators/roles.decorator';
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
    await expect(controller.getAccess(user('CUSTOMER'))).resolves.toEqual({
      operational: false,
      features: [],
    });
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
      features: ['BOOKING', 'LOYALTY'],
    });
  });

  it('does not swallow a 4xx (an unknown tenant is a real answer, never fail-open)', async () => {
    const backendHttp = makeBackendHttp();
    backendHttp.get.mockRejectedValueOnce(new HttpException('not found', HttpStatus.NOT_FOUND));

    await expect(new BillingController(backendHttp).getAccess(user('MANAGER'))).rejects.toThrow(
      HttpException,
    );
  });

  describe('the manager reads (M26-S14)', () => {
    const reflector = new Reflector();

    it('GET summary and charges are manager-only', () => {
      const proto = BillingController.prototype;

      expect(reflector.get(ROLES_KEY, proto.getSummary)).toEqual(['MANAGER']);
      expect(reflector.get(ROLES_KEY, proto.getCharges)).toEqual(['MANAGER']);
      // The access route stays open to every authenticated role.
      expect(reflector.get(ROLES_KEY, proto.getAccess)).toBeUndefined();
    });

    it('carries no tenant-access annotation: the backend owns suspension and entitlement', () => {
      for (const handler of [
        BillingController.prototype.getSummary,
        BillingController.prototype.getCharges,
      ]) {
        expect(reflector.get(SUSPENSION_ACCESS_KEY, handler)).toBeUndefined();
        expect(reflector.get(REQUIRES_FEATURE_KEY, handler)).toBeUndefined();
      }
    });

    it('reads the summary from the backend with no tenant parameter and maps it', async () => {
      const backendHttp = makeBackendHttp();
      backendHttp.get.mockResolvedValueOnce(new BillingSummaryBuilder().build());

      const summary = await new BillingController(backendHttp).getSummary();

      expect(backendHttp.get).toHaveBeenCalledWith('/billing/summary');
      expect(summary).toMatchObject({ provisioning: false, status: 'ACTIVE' });
    });

    it('answers the provisioning flag when the backend does', async () => {
      const backendHttp = makeBackendHttp();
      backendHttp.get.mockResolvedValueOnce({ provisioning: true });

      await expect(new BillingController(backendHttp).getSummary()).resolves.toEqual({
        provisioning: true,
      });
    });

    it('forwards the validated page to the backend and maps the history', async () => {
      const backendHttp = makeBackendHttp();
      backendHttp.get.mockResolvedValueOnce({
        items: [new BillingChargeHistoryItemBuilder().build()],
        pagination: { limit: 10, offset: 20, total: 21, hasMore: false },
      });

      const page = await new BillingController(backendHttp).getCharges({ limit: 10, offset: 20 });

      expect(backendHttp.get).toHaveBeenCalledWith('/billing/charges', { limit: 10, offset: 20 });
      expect(page.items).toHaveLength(1);
      expect(page.pagination).toEqual({ limit: 10, offset: 20, total: 21, hasMore: false });
    });

    it('rejects a backend answer that is not the documented shape instead of passing it on', async () => {
      const backendHttp = makeBackendHttp();
      backendHttp.get.mockResolvedValueOnce({ status: 'ACTIVE' });

      await expect(new BillingController(backendHttp).getSummary()).rejects.toThrow();
    });
  });
});
