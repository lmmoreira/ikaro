import { CurrentUserPayloadBuilder } from '../../test/builders/current-user-payload.builder';
import { makeBackendHttp } from '../../test/backend-http.mock';
import { StaffController } from './staff.controller';

const STAFF_ID = '30000000-0000-4000-8000-000000000001';

describe('StaffController', () => {
  describe('list()', () => {
    it('calls GET /staff with limit and offset (actor context comes from RequestContext via BFF headers)', async () => {
      const backendResult = {
        items: [],
        pagination: { limit: 10, offset: 5, total: 0, hasMore: false, nextOffset: null },
      };
      const backendHttp = makeBackendHttp({ get: jest.fn().mockResolvedValue(backendResult) });
      const controller = new StaffController(backendHttp);

      const result = await controller.list(10, 5);

      expect(backendHttp.get).toHaveBeenCalledWith('/staff', { limit: 10, offset: 5 });
      expect(result).toEqual(backendResult);
    });

    it('derives status per item and strips googleOAuthId from the response', async () => {
      const backendResult = {
        items: [
          {
            id: STAFF_ID,
            email: 'pendente@lavacar.com.br',
            name: null,
            role: 'STAFF',
            isActive: false,
            googleOAuthId: null,
            createdAt: '2026-01-01T00:00:00.000Z',
          },
        ],
        pagination: { limit: 50, offset: 0, total: 1, hasMore: false, nextOffset: null },
      };
      const backendHttp = makeBackendHttp({ get: jest.fn().mockResolvedValue(backendResult) });
      const controller = new StaffController(backendHttp);

      const result = await controller.list(50, 0);

      expect(result.items[0]).toEqual({
        id: STAFF_ID,
        email: 'pendente@lavacar.com.br',
        name: null,
        role: 'STAFF',
        isActive: false,
        createdAt: '2026-01-01T00:00:00.000Z',
        status: 'PENDING',
      });
    });
  });

  describe('getMe()', () => {
    it('calls GET /staff/:id with the id from the JWT sub, not a route param', async () => {
      const expectedResult = { id: STAFF_ID, email: 'gerente@lavacar.com.br', role: 'MANAGER' };
      const backendHttp = makeBackendHttp({ get: jest.fn().mockResolvedValue(expectedResult) });
      const controller = new StaffController(backendHttp);
      const user = CurrentUserPayloadBuilder.asManager()
        .withSub(STAFF_ID)
        .withTenantId('t-1')
        .build();

      const result = await controller.getMe(user);

      expect(backendHttp.get).toHaveBeenCalledWith(`/staff/${STAFF_ID}`);
      expect(result).toBe(expectedResult);
    });

    it('propagates errors from the backend', async () => {
      const backendHttp = makeBackendHttp({ get: jest.fn().mockRejectedValue(new Error('404')) });
      const controller = new StaffController(backendHttp);
      const user = CurrentUserPayloadBuilder.asStaff()
        .withSub(STAFF_ID)
        .withTenantId('t-1')
        .build();

      await expect(controller.getMe(user)).rejects.toThrow('404');
    });
  });

  describe('getById()', () => {
    it('calls GET /staff/:id (actor context comes from RequestContext via BFF headers)', async () => {
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

    it('calls POST /staff/invite with only body fields (tenantId + invitedBy come from RequestContext headers)', async () => {
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

  describe('update()', () => {
    const updateBody = { name: 'Nome Editado', role: 'MANAGER' as const };

    it('calls PATCH /staff/:id with the body (tenantId comes from RequestContext headers)', async () => {
      const expectedResult = { staffId: STAFF_ID, name: 'Nome Editado', role: 'MANAGER' };
      const backendHttp = makeBackendHttp({ patch: jest.fn().mockResolvedValue(expectedResult) });
      const controller = new StaffController(backendHttp);

      const result = await controller.update(STAFF_ID, updateBody);

      expect(backendHttp.patch).toHaveBeenCalledWith(`/staff/${STAFF_ID}`, updateBody);
      expect(result).toBe(expectedResult);
    });

    it('propagates 409 from backend when demoting the last active manager', async () => {
      const backendHttp = makeBackendHttp({
        patch: jest.fn().mockRejectedValue(new Error('409')),
      });
      const controller = new StaffController(backendHttp);

      await expect(controller.update(STAFF_ID, updateBody)).rejects.toThrow('409');
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
