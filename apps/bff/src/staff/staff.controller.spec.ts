import { CurrentUserPayload } from '../shared/decorators/current-user.decorator';
import { BackendHttpService } from '../shared/http/backend-http.service';
import { StaffController } from './staff.controller';

const TENANT_ID = '10000000-0000-4000-8000-000000000001';
const STAFF_ID = '30000000-0000-4000-8000-000000000001';

const makeUser = (overrides?: Partial<CurrentUserPayload>): CurrentUserPayload => ({
  sub: STAFF_ID,
  tenantId: TENANT_ID,
  tenantSlug: 'lavacar-bh',
  role: 'MANAGER',
  ...overrides,
});

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
    it('calls GET /internal/staff with tenantId, limit, and offset from the JWT', async () => {
      const expectedResult = {
        items: [],
        pagination: { limit: 10, offset: 5, total: 0, hasMore: false, nextOffset: null },
      };
      const backendHttp = makeBackendHttp({ get: jest.fn().mockResolvedValue(expectedResult) });
      const controller = new StaffController(backendHttp);

      const result = await controller.list(makeUser(), 10, 5);

      expect(backendHttp.get).toHaveBeenCalledWith('/internal/staff', {
        tenantId: TENANT_ID,
        limit: 10,
        offset: 5,
      });
      expect(result).toBe(expectedResult);
    });

    it('uses the tenantId from the current user JWT (not a request param)', async () => {
      const backendHttp = makeBackendHttp({ get: jest.fn().mockResolvedValue({ items: [] }) });
      const controller = new StaffController(backendHttp);
      const user = makeUser({ tenantId: '20000000-0000-4000-8000-000000000002' });

      await controller.list(user, 50, 0);

      expect(backendHttp.get).toHaveBeenCalledWith(
        '/internal/staff',
        expect.objectContaining({ tenantId: '20000000-0000-4000-8000-000000000002' }),
      );
    });
  });

  describe('getById()', () => {
    it('calls GET /internal/staff/:id with tenantId from the JWT', async () => {
      const expectedResult = { id: STAFF_ID, email: 'gerente@lavacar.com.br', role: 'MANAGER' };
      const backendHttp = makeBackendHttp({ get: jest.fn().mockResolvedValue(expectedResult) });
      const controller = new StaffController(backendHttp);

      const result = await controller.getById(STAFF_ID, makeUser());

      expect(backendHttp.get).toHaveBeenCalledWith(`/internal/staff/${STAFF_ID}`, {
        tenantId: TENANT_ID,
      });
      expect(result).toBe(expectedResult);
    });

    it('propagates errors from the backend (isolation enforced at backend)', async () => {
      const backendHttp = makeBackendHttp({ get: jest.fn().mockRejectedValue(new Error('404')) });
      const controller = new StaffController(backendHttp);

      await expect(controller.getById('non-existent', makeUser())).rejects.toThrow('404');
    });
  });

  describe('invite()', () => {
    const inviteBody = {
      email: 'novo@lavacar.com.br',
      firstName: 'João',
      lastName: 'Silva',
      role: 'STAFF' as const,
    };

    it('calls POST /internal/staff/invite with tenantId and invitedBy from the JWT', async () => {
      const expectedResult = {
        staffId: '40000000-0000-4000-8000-000000000001',
        email: 'novo@lavacar.com.br',
        role: 'STAFF',
        isActive: false,
      };
      const backendHttp = makeBackendHttp({ post: jest.fn().mockResolvedValue(expectedResult) });
      const controller = new StaffController(backendHttp);

      const result = await controller.invite(inviteBody, makeUser());

      expect(backendHttp.post).toHaveBeenCalledWith('/internal/staff/invite', {
        tenantId: TENANT_ID,
        email: 'novo@lavacar.com.br',
        firstName: 'João',
        lastName: 'Silva',
        role: 'STAFF',
        invitedBy: STAFF_ID,
      });
      expect(result).toBe(expectedResult);
    });

    it('uses the sub from the current user JWT as invitedBy', async () => {
      const backendHttp = makeBackendHttp({ post: jest.fn().mockResolvedValue({}) });
      const controller = new StaffController(backendHttp);
      const user = makeUser({ sub: '50000000-0000-4000-8000-000000000001' });

      await controller.invite(inviteBody, user);

      expect(backendHttp.post).toHaveBeenCalledWith(
        '/internal/staff/invite',
        expect.objectContaining({ invitedBy: '50000000-0000-4000-8000-000000000001' }),
      );
    });

    it('propagates backend errors', async () => {
      const backendHttp = makeBackendHttp({
        post: jest.fn().mockRejectedValue(new Error('409')),
      });
      const controller = new StaffController(backendHttp);

      await expect(controller.invite(inviteBody, makeUser())).rejects.toThrow('409');
    });
  });
});
