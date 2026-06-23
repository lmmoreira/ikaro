import { makeBackendHttp } from '../test/backend-http.mock';
import { TenantController } from './tenant.controller';

describe('TenantController', () => {
  afterEach(() => jest.resetAllMocks());

  describe('rename()', () => {
    it('calls PATCH /tenants with the parsed body and returns the response', async () => {
      const response = { tenantId: '10000000-0000-4000-8000-000000000001', name: 'Novo Nome' };
      const backendHttp = makeBackendHttp({ patch: jest.fn().mockResolvedValue(response) });
      const controller = new TenantController(backendHttp);

      const result = await controller.rename({ name: 'Novo Nome' });

      expect(backendHttp.patch).toHaveBeenCalledWith('/tenants', { name: 'Novo Nome' });
      expect(result).toEqual(response);
    });

    it('propagates errors from the backend', async () => {
      const backendHttp = makeBackendHttp({ patch: jest.fn().mockRejectedValue(new Error('409')) });
      const controller = new TenantController(backendHttp);

      await expect(controller.rename({ name: 'Novo Nome' })).rejects.toThrow('409');
    });
  });
});
