import { HttpException, INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  MockHttpService,
  MockBackendHttpService,
  createTestApp,
  makeCustomerJwt,
  makeManagerJwt,
  makeStaffJwt,
  setupActiveGuardMock,
  request,
} from '../../test/component-test.helpers';
import { ResourceListResponse, ResourceResponse } from './resource.types';

const RESOURCE_ID = '30000000-0000-4000-8000-000000000003';

const mockResource: ResourceResponse = {
  id: RESOURCE_ID,
  type: 'ROOM',
  refId: null,
  name: 'Estúdio 1',
  workingHours: null,
  turnoverMinutes: 0,
  maxCapacity: 12,
  isActive: true,
};

const mockListResponse: ResourceListResponse = { items: [mockResource] };

describe('ResourceController (component)', () => {
  let app: INestApplication;
  let jwtService: JwtService;
  let httpService: MockHttpService;
  let backendHttpService: MockBackendHttpService;
  let restoreEnv: () => void;

  beforeAll(async () => {
    ({ app, jwtService, httpService, backendHttpService, restoreEnv } = await createTestApp());
  });

  afterAll(async () => {
    await app.close();
    restoreEnv();
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  // ─── GET /v1/resources ────────────────────────────────────────────────────

  describe('GET /v1/resources', () => {
    it('returns 401 without a token', async () => {
      const res = await request(app.getHttpServer()).get('/v1/resources');
      expect(res.status).toBe(401);
    });

    it('returns 403 for STAFF role (MANAGER-only)', async () => {
      setupActiveGuardMock(httpService);
      const res = await request(app.getHttpServer())
        .get('/v1/resources')
        .set('Authorization', `Bearer ${makeStaffJwt(jwtService)}`);
      expect(res.status).toBe(403);
    });

    it('returns 403 for CUSTOMER role', async () => {
      const res = await request(app.getHttpServer())
        .get('/v1/resources')
        .set('Authorization', `Bearer ${makeCustomerJwt(jwtService)}`);
      expect(res.status).toBe(403);
    });

    it('MANAGER JWT → 200, calls GET /resources on backend', async () => {
      setupActiveGuardMock(httpService);
      backendHttpService.get.mockResolvedValueOnce(mockListResponse);

      const res = await request(app.getHttpServer())
        .get('/v1/resources?type=ROOM&isActive=true')
        .set('Authorization', `Bearer ${makeManagerJwt(jwtService)}`);

      expect(res.status).toBe(200);
      expect(res.body).toEqual(mockListResponse);
      expect(backendHttpService.get).toHaveBeenCalledWith('/resources', {
        type: 'ROOM',
        isActive: 'true',
      });
    });
  });

  // ─── GET /v1/resources/staff-options ──────────────────────────────────────

  describe('GET /v1/resources/staff-options', () => {
    const staffItems = [
      { id: 'staff-1', name: 'Camila Duarte', email: 'camila@x.com', isActive: true },
    ];
    const staffResource: ResourceResponse = {
      ...mockResource,
      id: 'res-1',
      type: 'STAFF',
      refId: 'staff-1',
    };

    it('returns 401 without a token', async () => {
      const res = await request(app.getHttpServer()).get('/v1/resources/staff-options');
      expect(res.status).toBe(401);
    });

    it('returns 403 for STAFF role', async () => {
      setupActiveGuardMock(httpService);
      const res = await request(app.getHttpServer())
        .get('/v1/resources/staff-options')
        .set('Authorization', `Bearer ${makeStaffJwt(jwtService)}`);
      expect(res.status).toBe(403);
    });

    it('MANAGER JWT → 200, merges Staff + Resource backend reads into one response', async () => {
      setupActiveGuardMock(httpService);
      backendHttpService.get.mockImplementation((path: string) => {
        if (path === '/staff') return Promise.resolve({ items: staffItems });
        return Promise.resolve({ items: [staffResource] });
      });

      const res = await request(app.getHttpServer())
        .get('/v1/resources/staff-options')
        .set('Authorization', `Bearer ${makeManagerJwt(jwtService)}`);

      expect(res.status).toBe(200);
      expect(res.body.items).toEqual([expect.objectContaining({ id: 'staff-1', isWrapped: true })]);
    });
  });

  // ─── GET /v1/resources/:id ────────────────────────────────────────────────

  describe('GET /v1/resources/:id', () => {
    it('returns 401 without a token', async () => {
      const res = await request(app.getHttpServer()).get(`/v1/resources/${RESOURCE_ID}`);
      expect(res.status).toBe(401);
    });

    it('returns 403 for STAFF role', async () => {
      setupActiveGuardMock(httpService);
      const res = await request(app.getHttpServer())
        .get(`/v1/resources/${RESOURCE_ID}`)
        .set('Authorization', `Bearer ${makeStaffJwt(jwtService)}`);
      expect(res.status).toBe(403);
    });

    it('MANAGER JWT → 200, calls GET /resources/:id on backend', async () => {
      setupActiveGuardMock(httpService);
      backendHttpService.get.mockResolvedValueOnce(mockResource);

      const res = await request(app.getHttpServer())
        .get(`/v1/resources/${RESOURCE_ID}`)
        .set('Authorization', `Bearer ${makeManagerJwt(jwtService)}`);

      expect(res.status).toBe(200);
      expect(res.body).toEqual(mockResource);
      expect(backendHttpService.get).toHaveBeenCalledWith(`/resources/${RESOURCE_ID}`);
    });

    it('propagates backend 404 as 404', async () => {
      setupActiveGuardMock(httpService);
      backendHttpService.get.mockRejectedValueOnce(new HttpException('Not Found', 404));

      const res = await request(app.getHttpServer())
        .get(`/v1/resources/${RESOURCE_ID}`)
        .set('Authorization', `Bearer ${makeManagerJwt(jwtService)}`);

      expect(res.status).toBe(404);
    });
  });

  // ─── POST /v1/resources ───────────────────────────────────────────────────

  describe('POST /v1/resources', () => {
    it('returns 401 without a token', async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/resources')
        .send({ type: 'ROOM', name: 'Estúdio 1' });
      expect(res.status).toBe(401);
    });

    it('returns 403 for STAFF role', async () => {
      setupActiveGuardMock(httpService);
      const res = await request(app.getHttpServer())
        .post('/v1/resources')
        .set('Authorization', `Bearer ${makeStaffJwt(jwtService)}`)
        .send({ type: 'ROOM', name: 'Estúdio 1' });
      expect(res.status).toBe(403);
    });

    it('forwards type=LOCATION to the backend and propagates its 422 (domain-level rejection, not a BFF-level Zod one)', async () => {
      // LOCATION is a valid ResourceTypeSchema member — "never manually created" is a
      // domain rule (ResourceTypeNotCreatableError -> 422), not a BFF transport-level 400
      // (docs/14-API_CONTRACTS.md § Resource Management, Codex round-4 finding PR #457).
      setupActiveGuardMock(httpService);
      backendHttpService.post.mockRejectedValueOnce(new HttpException('Unprocessable Entity', 422));

      const res = await request(app.getHttpServer())
        .post('/v1/resources')
        .set('Authorization', `Bearer ${makeManagerJwt(jwtService)}`)
        .send({ type: 'LOCATION', name: 'Unidade Única' });

      expect(res.status).toBe(422);
      expect(backendHttpService.post).toHaveBeenCalledWith('/resources', {
        type: 'LOCATION',
        name: 'Unidade Única',
      });
    });

    it('returns 400 when name is missing (Zod)', async () => {
      setupActiveGuardMock(httpService);
      const res = await request(app.getHttpServer())
        .post('/v1/resources')
        .set('Authorization', `Bearer ${makeManagerJwt(jwtService)}`)
        .send({ type: 'ROOM' });
      expect(res.status).toBe(400);
    });

    it('MANAGER JWT → 201, calls POST /resources on backend', async () => {
      setupActiveGuardMock(httpService);
      backendHttpService.post.mockResolvedValueOnce(mockResource);

      const res = await request(app.getHttpServer())
        .post('/v1/resources')
        .set('Authorization', `Bearer ${makeManagerJwt(jwtService)}`)
        .send({ type: 'ROOM', name: 'Estúdio 1', maxCapacity: 12 });

      expect(res.status).toBe(201);
      expect(res.body).toEqual(mockResource);
      expect(backendHttpService.post).toHaveBeenCalledWith('/resources', {
        type: 'ROOM',
        name: 'Estúdio 1',
        maxCapacity: 12,
      });
    });

    it('propagates backend 409 as 409', async () => {
      setupActiveGuardMock(httpService);
      backendHttpService.post.mockRejectedValueOnce(new HttpException('Conflict', 409));

      const res = await request(app.getHttpServer())
        .post('/v1/resources')
        .set('Authorization', `Bearer ${makeManagerJwt(jwtService)}`)
        .send({ type: 'STAFF', refId: '00000000-0000-4000-8000-000000000099', name: 'X' });

      expect(res.status).toBe(409);
    });

    it('propagates backend 422 as 422', async () => {
      setupActiveGuardMock(httpService);
      backendHttpService.post.mockRejectedValueOnce(new HttpException('Unprocessable Entity', 422));

      const res = await request(app.getHttpServer())
        .post('/v1/resources')
        .set('Authorization', `Bearer ${makeManagerJwt(jwtService)}`)
        .send({ type: 'ROOM', name: 'Estúdio 1' });

      expect(res.status).toBe(422);
    });
  });

  // ─── PATCH /v1/resources/:id ──────────────────────────────────────────────

  describe('PATCH /v1/resources/:id', () => {
    it('returns 403 for STAFF role', async () => {
      setupActiveGuardMock(httpService);
      const res = await request(app.getHttpServer())
        .patch(`/v1/resources/${RESOURCE_ID}`)
        .set('Authorization', `Bearer ${makeStaffJwt(jwtService)}`)
        .send({ workingHours: null });
      expect(res.status).toBe(403);
    });

    it('MANAGER JWT → 200, calls PATCH /resources/:id on backend', async () => {
      setupActiveGuardMock(httpService);
      backendHttpService.patch.mockResolvedValueOnce(mockResource);

      const res = await request(app.getHttpServer())
        .patch(`/v1/resources/${RESOURCE_ID}`)
        .set('Authorization', `Bearer ${makeManagerJwt(jwtService)}`)
        .send({ workingHours: null });

      expect(res.status).toBe(200);
      expect(backendHttpService.patch).toHaveBeenCalledWith(`/resources/${RESOURCE_ID}`, {
        workingHours: null,
      });
    });

    it('MANAGER JWT → 200, forwards name/type/maxCapacity through real Zod validation', async () => {
      setupActiveGuardMock(httpService);
      backendHttpService.patch.mockResolvedValueOnce(mockResource);

      const res = await request(app.getHttpServer())
        .patch(`/v1/resources/${RESOURCE_ID}`)
        .set('Authorization', `Bearer ${makeManagerJwt(jwtService)}`)
        .send({ name: 'Estúdio 2', type: 'EQUIPMENT', maxCapacity: 4 });

      expect(res.status).toBe(200);
      expect(backendHttpService.patch).toHaveBeenCalledWith(`/resources/${RESOURCE_ID}`, {
        name: 'Estúdio 2',
        type: 'EQUIPMENT',
        maxCapacity: 4,
      });
    });

    it('returns 400 for an unknown field (strict schema)', async () => {
      setupActiveGuardMock(httpService);
      const res = await request(app.getHttpServer())
        .patch(`/v1/resources/${RESOURCE_ID}`)
        .set('Authorization', `Bearer ${makeManagerJwt(jwtService)}`)
        .send({ notAField: 'x' });
      expect(res.status).toBe(400);
    });

    it('MANAGER JWT with an empty body → 200 (all fields optional)', async () => {
      setupActiveGuardMock(httpService);
      backendHttpService.patch.mockResolvedValueOnce(mockResource);

      const res = await request(app.getHttpServer())
        .patch(`/v1/resources/${RESOURCE_ID}`)
        .set('Authorization', `Bearer ${makeManagerJwt(jwtService)}`)
        .send({});

      expect(res.status).toBe(200);
      expect(backendHttpService.patch).toHaveBeenCalledWith(`/resources/${RESOURCE_ID}`, {});
    });

    it('propagates backend 404 as 404', async () => {
      setupActiveGuardMock(httpService);
      backendHttpService.patch.mockRejectedValueOnce(new HttpException('Not Found', 404));

      const res = await request(app.getHttpServer())
        .patch(`/v1/resources/${RESOURCE_ID}`)
        .set('Authorization', `Bearer ${makeManagerJwt(jwtService)}`)
        .send({ workingHours: null });

      expect(res.status).toBe(404);
    });
  });

  // ─── DELETE /v1/resources/:id ─────────────────────────────────────────────

  describe('DELETE /v1/resources/:id', () => {
    it('returns 403 for STAFF role', async () => {
      setupActiveGuardMock(httpService);
      const res = await request(app.getHttpServer())
        .delete(`/v1/resources/${RESOURCE_ID}`)
        .set('Authorization', `Bearer ${makeStaffJwt(jwtService)}`);
      expect(res.status).toBe(403);
    });

    it('MANAGER JWT → 204, calls DELETE /resources/:id on backend', async () => {
      setupActiveGuardMock(httpService);
      backendHttpService.delete.mockResolvedValueOnce(undefined);

      const res = await request(app.getHttpServer())
        .delete(`/v1/resources/${RESOURCE_ID}`)
        .set('Authorization', `Bearer ${makeManagerJwt(jwtService)}`);

      expect(res.status).toBe(204);
      expect(backendHttpService.delete).toHaveBeenCalledWith(`/resources/${RESOURCE_ID}`);
    });
  });

  // ─── POST /v1/resources/:id/reactivate ────────────────────────────────────

  describe('POST /v1/resources/:id/reactivate', () => {
    it('returns 403 for STAFF role', async () => {
      setupActiveGuardMock(httpService);
      const res = await request(app.getHttpServer())
        .post(`/v1/resources/${RESOURCE_ID}/reactivate`)
        .set('Authorization', `Bearer ${makeStaffJwt(jwtService)}`);
      expect(res.status).toBe(403);
    });

    it('MANAGER JWT → 200, calls POST /resources/:id/reactivate on backend', async () => {
      setupActiveGuardMock(httpService);
      backendHttpService.post.mockResolvedValueOnce({ ...mockResource, isActive: true });

      const res = await request(app.getHttpServer())
        .post(`/v1/resources/${RESOURCE_ID}/reactivate`)
        .set('Authorization', `Bearer ${makeManagerJwt(jwtService)}`);

      expect(res.status).toBe(200);
      expect(backendHttpService.post).toHaveBeenCalledWith(
        `/resources/${RESOURCE_ID}/reactivate`,
        {},
      );
    });

    it('propagates backend 409 as 409', async () => {
      setupActiveGuardMock(httpService);
      backendHttpService.post.mockRejectedValueOnce(new HttpException('Conflict', 409));

      const res = await request(app.getHttpServer())
        .post(`/v1/resources/${RESOURCE_ID}/reactivate`)
        .set('Authorization', `Bearer ${makeManagerJwt(jwtService)}`);

      expect(res.status).toBe(409);
    });
  });
});
