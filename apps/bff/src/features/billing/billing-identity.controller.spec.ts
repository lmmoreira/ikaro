import { Reflector } from '@nestjs/core';
import { REQUIRES_FEATURE_KEY, SUSPENSION_ACCESS_KEY } from '@ikaro/nestjs-http';
import { makeBackendHttp } from '../../test/backend-http.mock';
import { BillingIdentityBuilder } from '../../test/builders/billing-identity.builder';
import { ROLES_KEY } from '../../shared/decorators/roles.decorator';
import { BillingController } from './billing.controller';

describe('BillingController — the billing identity (M26-S16, UC-118)', () => {
  const reflector = new Reflector();

  it('GET and PUT identity are manager-only and carry no tenant-access annotation (M25-S33)', () => {
    for (const handler of [
      BillingController.prototype.getIdentity,
      BillingController.prototype.saveIdentity,
    ]) {
      expect(reflector.get(ROLES_KEY, handler)).toEqual(['MANAGER']);
      expect(reflector.get(SUSPENSION_ACCESS_KEY, handler)).toBeUndefined();
      expect(reflector.get(REQUIRES_FEATURE_KEY, handler)).toBeUndefined();
    }
  });

  it('reads the identity from the backend with no tenant parameter and maps it', async () => {
    const backendHttp = makeBackendHttp();
    backendHttp.get.mockResolvedValueOnce(new BillingIdentityBuilder().build());

    const identity = await new BillingController(backendHttp).getIdentity();

    expect(backendHttp.get).toHaveBeenCalledWith('/billing/identity');
    expect(identity).toMatchObject({ provisioning: false, taxIdType: 'CNPJ' });
  });

  it('answers the provisioning flag when the backend does', async () => {
    const backendHttp = makeBackendHttp();
    backendHttp.get.mockResolvedValueOnce({ provisioning: true });

    await expect(new BillingController(backendHttp).getIdentity()).resolves.toEqual({
      provisioning: true,
    });
  });

  it('forwards the validated body to the backend as it is and maps the saved identity', async () => {
    const backendHttp = makeBackendHttp();
    const saved = new BillingIdentityBuilder().build();
    backendHttp.put.mockResolvedValueOnce(saved);
    const body = { taxId: '11.222.333/0001-81', address: { city: 'Contagem' } };

    const result = await new BillingController(backendHttp).saveIdentity(body);

    expect(backendHttp.put).toHaveBeenCalledWith('/billing/identity', body);
    expect(result).toEqual(saved);
  });

  it('rejects a backend answer that is not the documented shape, and never passes extras on', async () => {
    const backendHttp = makeBackendHttp();
    backendHttp.get.mockResolvedValueOnce({ provisioning: false, taxId: 12 });
    const controller = new BillingController(backendHttp);

    await expect(controller.getIdentity()).rejects.toThrow();

    backendHttp.put.mockResolvedValueOnce({ ...new BillingIdentityBuilder().build(), secret: 'x' });
    await expect(controller.saveIdentity({})).resolves.not.toHaveProperty('secret');
  });
});
