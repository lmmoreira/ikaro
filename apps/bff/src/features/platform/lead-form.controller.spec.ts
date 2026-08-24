import { LeadFormConfigResponse } from '@ikaro/types';
import { makeBackendHttp } from '../../test/backend-http.mock';
import { LeadFormController } from './lead-form.controller';

const configResponse: LeadFormConfigResponse = {
  title: 'Fale com a gente',
  ctaLabel: 'Preencher formulário',
  audienceMode: 'GUEST_AND_CUSTOMER',
  questions: [],
};

describe('LeadFormController', () => {
  afterEach(() => jest.resetAllMocks());

  describe('getConfig()', () => {
    it('calls GET /tenants/lead-form/config and returns the backend response unchanged', async () => {
      const backendHttp = makeBackendHttp({ get: jest.fn().mockResolvedValue(configResponse) });
      const controller = new LeadFormController(backendHttp);

      const result = await controller.getConfig();

      expect(backendHttp.get).toHaveBeenCalledWith('/tenants/lead-form/config');
      expect(result).toEqual(configResponse);
    });

    it('propagates errors from the backend', async () => {
      const backendHttp = makeBackendHttp({ get: jest.fn().mockRejectedValue(new Error('404')) });
      const controller = new LeadFormController(backendHttp);

      await expect(controller.getConfig()).rejects.toThrow('404');
    });
  });

  describe('updateConfig()', () => {
    it('calls PATCH /tenants/lead-form/config with the parsed body and returns the backend response', async () => {
      const backendHttp = makeBackendHttp({ patch: jest.fn().mockResolvedValue(configResponse) });
      const controller = new LeadFormController(backendHttp);
      const body = { title: 'Fale com a gente' };

      const result = await controller.updateConfig(body);

      expect(backendHttp.patch).toHaveBeenCalledWith('/tenants/lead-form/config', body);
      expect(result).toEqual(configResponse);
    });

    it('propagates errors from the backend', async () => {
      const backendHttp = makeBackendHttp({ patch: jest.fn().mockRejectedValue(new Error('400')) });
      const controller = new LeadFormController(backendHttp);

      await expect(controller.updateConfig({ title: 'x' })).rejects.toThrow('400');
    });
  });

  describe('getStatus()', () => {
    it('calls GET /tenants/lead-form/status and returns the backend response unchanged', async () => {
      const backendHttp = makeBackendHttp({
        get: jest.fn().mockResolvedValue({ enabled: true }),
      });
      const controller = new LeadFormController(backendHttp);

      const result = await controller.getStatus();

      expect(backendHttp.get).toHaveBeenCalledWith('/tenants/lead-form/status');
      expect(result).toEqual({ enabled: true });
    });
  });
});
