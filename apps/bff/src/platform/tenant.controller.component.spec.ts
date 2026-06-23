import { HttpException, INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  MockBackendHttpService,
  MockHttpService,
  TENANT_ID,
  createTestApp,
  makeCustomerJwt,
  makeManagerJwt,
  makeStaffJwt,
  request,
  setupActiveGuardMock,
} from '../test/component-test.helpers';

describe('TenantController (component)', () => {
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

  describe('authentication and role gates', () => {
    it('PATCH /v1/tenants → 401 without a token', async () => {
      const res = await request(app.getHttpServer())
        .patch('/v1/tenants')
        .send({ name: 'Novo Nome' });
      expect(res.status).toBe(401);
    });

    it('PATCH /v1/tenants → 403 for STAFF role', async () => {
      const res = await request(app.getHttpServer())
        .patch('/v1/tenants')
        .set('Authorization', `Bearer ${makeStaffJwt(jwtService)}`)
        .send({ name: 'Novo Nome' });
      expect(res.status).toBe(403);
    });

    it('PATCH /v1/tenants → 403 for CUSTOMER role', async () => {
      const res = await request(app.getHttpServer())
        .patch('/v1/tenants')
        .set('Authorization', `Bearer ${makeCustomerJwt(jwtService)}`)
        .send({ name: 'Novo Nome' });
      expect(res.status).toBe(403);
    });
  });

  describe('rename', () => {
    it('PATCH /v1/tenants → 200, proxies to backend PATCH /tenants and maps the response', async () => {
      setupActiveGuardMock(httpService);
      backendHttpService.patch.mockResolvedValueOnce({ tenantId: TENANT_ID, name: 'AutoWash Pro' });

      const res = await request(app.getHttpServer())
        .patch('/v1/tenants')
        .set('Authorization', `Bearer ${makeManagerJwt(jwtService)}`)
        .send({ name: 'AutoWash Pro' });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ tenantId: TENANT_ID, name: 'AutoWash Pro' });
      expect(backendHttpService.patch).toHaveBeenCalledWith('/tenants', { name: 'AutoWash Pro' });
    });

    it('PATCH /v1/tenants → 400 for an empty name', async () => {
      setupActiveGuardMock(httpService);

      const res = await request(app.getHttpServer())
        .patch('/v1/tenants')
        .set('Authorization', `Bearer ${makeManagerJwt(jwtService)}`)
        .send({ name: '' });

      expect(res.status).toBe(400);
      expect(backendHttpService.patch).not.toHaveBeenCalled();
    });

    it('PATCH /v1/tenants → forwards the backend error status when rename fails', async () => {
      setupActiveGuardMock(httpService);
      backendHttpService.patch.mockRejectedValueOnce(
        new HttpException({ status: 409, detail: 'Tenant is inactive' }, 409),
      );

      const res = await request(app.getHttpServer())
        .patch('/v1/tenants')
        .set('Authorization', `Bearer ${makeManagerJwt(jwtService)}`)
        .send({ name: 'AutoWash Pro' });

      expect(res.status).toBe(409);
    });
  });
});
