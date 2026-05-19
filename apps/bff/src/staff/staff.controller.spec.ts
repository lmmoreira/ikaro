import { BackendHttpService } from '../shared/http/backend-http.service';
import { StaffController } from './staff.controller';

const STAFF_ID = '30000000-0000-4000-8000-000000000001';

const makeBackendHttp = (overrides?: Partial<BackendHttpService>): BackendHttpService =>
  ({
    get: jest.fn(),
    post: jest.fn(),
    patch: jest.fn(),
    delete: jest.fn(),
    ...overrides,
  }) as unknown as BackendHttpService;

describe('StaffController', () => {
  describe('list()', () => {
    it('calls GET /staff with limit and offset (actor context comes from TenantContext via BFF headers)', async () => {
      const expectedResult = {
        items: [],
        pagination: { limit: 10, offset: 5, total: 0, hasMore: false, nextOffset: null },
      };
      const backendHttp = makeBackendHttp({ get: jest.fn().mockResolvedValue(expectedResult) });
      const controller = new StaffController(backendHttp);

      const result = await controller.list(10, 5);

      expect(backendHttp.get).toHaveBeenCalledWith('/staff', { limit: 10, offset: 5 });
      expect(result).toBe(expectedResult);
    });
  });

  describe('getById()', () => {
    it('calls GET /staff/:id (actor context comes from TenantContext via BFF headers)', async () => {
      const expectedResult = { id: STAFF_ID, email: 'gerente@lavacar.com.br', role: 'MANAGER' };
      const backendHttp = makeBackendHttp({ get: jest.fn().mockResolvedValue(expectedResult) });
      const controller = new StaffController(backendHttp);

      const result = await controller.getById(STAFF_ID);

      expect(backendHttp.get).toHaveBeenCalledWith(`/staff/${STAFF_ID}`);
      expect(result).toBe(expectedResult);
    });

    it('propagates errors from the backend (isolation enforced at backend)', async () => {
      const backendHttp = makeBackendHttp({ get: jest.fn().mockRejectedValue(new Error('404')) });
      const controller = new StaffController(backendHttp);

      await expect(controller.getById('non-existent')).rejects.toThrow('404');
    });
  });

  describe('invite()', () => {
    const inviteBody = {
      email: 'novo@lavacar.com.br',
      firstName: 'João',
      lastName: 'Silva',
      role: 'STAFF' as const,
    };

    it('calls POST /staff/invite with only body fields (tenantId + invitedBy come from TenantContext headers)', async () => {
      const expectedResult = {
        staffId: '40000000-0000-4000-8000-000000000001',
        email: 'novo@lavacar.com.br',
        role: 'STAFF',
        isActive: false,
      };
      const backendHttp = makeBackendHttp({ post: jest.fn().mockResolvedValue(expectedResult) });
      const controller = new StaffController(backendHttp);

      const result = await controller.invite(inviteBody);

      expect(backendHttp.post).toHaveBeenCalledWith('/staff/invite', {
        email: 'novo@lavacar.com.br',
        firstName: 'João',
        lastName: 'Silva',
        role: 'STAFF',
      });
      expect(result).toBe(expectedResult);
    });

    it('propagates backend errors', async () => {
      const backendHttp = makeBackendHttp({
        post: jest.fn().mockRejectedValue(new Error('409')),
      });
      const controller = new StaffController(backendHttp);

      await expect(controller.invite(inviteBody)).rejects.toThrow('409');
    });
  });

  describe('deactivate()', () => {
    it('calls PATCH /staff/:id/deactivate with empty body', async () => {
      const expectedResult = { staffId: STAFF_ID, isActive: false };
      const backendHttp = makeBackendHttp({ patch: jest.fn().mockResolvedValue(expectedResult) });
      const controller = new StaffController(backendHttp);

      const result = await controller.deactivate(STAFF_ID);

      expect(backendHttp.patch).toHaveBeenCalledWith(`/staff/${STAFF_ID}/deactivate`, {});
      expect(result).toBe(expectedResult);
    });

    it('propagates 403 from backend when self-deactivation', async () => {
      const backendHttp = makeBackendHttp({
        patch: jest.fn().mockRejectedValue(new Error('403')),
      });
      const controller = new StaffController(backendHttp);

      await expect(controller.deactivate(STAFF_ID)).rejects.toThrow('403');
    });
  });
});
