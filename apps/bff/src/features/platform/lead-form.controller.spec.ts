import {
  LeadFormConfigResponse,
  LeadFormSubmissionDetailResponse,
  LeadFormSubmissionsListResponse,
} from '@ikaro/types';
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

  describe('listSubmissions()', () => {
    it('calls GET /tenants/lead-form/submissions with the parsed query and returns the backend response unchanged', async () => {
      const listResponse: LeadFormSubmissionsListResponse = {
        items: [
          {
            id: 'sub-1',
            name: 'Maria Silva',
            email: 'maria@example.com',
            phone: '+5511912345678',
            submittedAt: '2026-01-01T00:00:00.000Z',
          },
        ],
        page: 1,
        pageSize: 20,
        total: 1,
      };
      const backendHttp = makeBackendHttp({ get: jest.fn().mockResolvedValue(listResponse) });
      const controller = new LeadFormController(backendHttp);

      const result = await controller.listSubmissions({ page: 1, pageSize: 20 });

      expect(backendHttp.get).toHaveBeenCalledWith('/tenants/lead-form/submissions', {
        page: 1,
        pageSize: 20,
      });
      expect(result).toEqual(listResponse);
    });

    it('propagates errors from the backend', async () => {
      const backendHttp = makeBackendHttp({ get: jest.fn().mockRejectedValue(new Error('500')) });
      const controller = new LeadFormController(backendHttp);

      await expect(controller.listSubmissions({ page: 1, pageSize: 20 })).rejects.toThrow('500');
    });
  });

  describe('getSubmission()', () => {
    it('calls GET /tenants/lead-form/submissions/:id and returns the backend response unchanged', async () => {
      const detailResponse: LeadFormSubmissionDetailResponse = {
        id: 'sub-1',
        name: 'Maria Silva',
        email: 'maria@example.com',
        phone: '+5511912345678',
        answers: [{ questionLabel: 'Origem', questionType: 'TEXT', answerValue: 'Google' }],
        submittedAt: '2026-01-01T00:00:00.000Z',
        customerId: null,
      };
      const backendHttp = makeBackendHttp({ get: jest.fn().mockResolvedValue(detailResponse) });
      const controller = new LeadFormController(backendHttp);

      const result = await controller.getSubmission('sub-1');

      expect(backendHttp.get).toHaveBeenCalledWith('/tenants/lead-form/submissions/sub-1');
      expect(result).toEqual(detailResponse);
    });

    it('propagates errors (e.g. 404) from the backend', async () => {
      const backendHttp = makeBackendHttp({ get: jest.fn().mockRejectedValue(new Error('404')) });
      const controller = new LeadFormController(backendHttp);

      await expect(controller.getSubmission('unknown-id')).rejects.toThrow('404');
    });
  });
});
