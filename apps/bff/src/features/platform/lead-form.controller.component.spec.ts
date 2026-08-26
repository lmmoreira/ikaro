import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  LeadFormConfigResponse,
  LeadFormSubmissionDetailResponse,
  LeadFormSubmissionsListResponse,
} from '@ikaro/types';
import {
  MockBackendHttpService,
  MockHttpService,
  createTestApp,
  makeCustomerJwt,
  makeManagerJwt,
  makeStaffJwt,
  request,
  setupActiveGuardMock,
} from '../../test/component-test.helpers';

const configResponse: LeadFormConfigResponse = {
  title: 'Fale com a gente',
  ctaLabel: 'Preencher formulário',
  audienceMode: 'GUEST_AND_CUSTOMER',
  questions: [],
};

const SUBMISSION_ID = '01234567-0000-7000-8000-000000000001';

const listResponse: LeadFormSubmissionsListResponse = {
  items: [
    {
      id: SUBMISSION_ID,
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

const detailResponse: LeadFormSubmissionDetailResponse = {
  id: SUBMISSION_ID,
  name: 'Maria Silva',
  email: 'maria@example.com',
  phone: '+5511912345678',
  answers: [{ questionLabel: 'Origem', questionType: 'TEXT', answerValue: 'Google' }],
  submittedAt: '2026-01-01T00:00:00.000Z',
};

describe('LeadFormController (component)', () => {
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
    it('GET /v1/tenants/lead-form/config → 401 without a token', async () => {
      const res = await request(app.getHttpServer()).get('/v1/tenants/lead-form/config');
      expect(res.status).toBe(401);
    });

    it('GET /v1/tenants/lead-form/config → 403 for STAFF role', async () => {
      const res = await request(app.getHttpServer())
        .get('/v1/tenants/lead-form/config')
        .set('Authorization', `Bearer ${makeStaffJwt(jwtService)}`);
      expect(res.status).toBe(403);
    });

    it('PATCH /v1/tenants/lead-form/config → 403 for STAFF role', async () => {
      const res = await request(app.getHttpServer())
        .patch('/v1/tenants/lead-form/config')
        .set('Authorization', `Bearer ${makeStaffJwt(jwtService)}`)
        .send({ title: 'Fale com a gente' });
      expect(res.status).toBe(403);
    });

    it('PATCH /v1/tenants/lead-form/config → 403 for CUSTOMER role', async () => {
      const res = await request(app.getHttpServer())
        .patch('/v1/tenants/lead-form/config')
        .set('Authorization', `Bearer ${makeCustomerJwt(jwtService)}`)
        .send({ title: 'Fale com a gente' });
      expect(res.status).toBe(403);
    });

    it('GET /v1/tenants/lead-form/status → 200 for STAFF role', async () => {
      setupActiveGuardMock(httpService);
      backendHttpService.get.mockResolvedValueOnce({ enabled: true });

      const res = await request(app.getHttpServer())
        .get('/v1/tenants/lead-form/status')
        .set('Authorization', `Bearer ${makeStaffJwt(jwtService)}`);

      expect(res.status).toBe(200);
      expect(backendHttpService.get).toHaveBeenCalledWith('/tenants/lead-form/status');
    });
  });

  describe('getConfig', () => {
    it('GET /v1/tenants/lead-form/config → 200, proxies to backend unchanged', async () => {
      setupActiveGuardMock(httpService);
      backendHttpService.get.mockResolvedValueOnce(configResponse);

      const res = await request(app.getHttpServer())
        .get('/v1/tenants/lead-form/config')
        .set('Authorization', `Bearer ${makeManagerJwt(jwtService)}`);

      expect(res.status).toBe(200);
      expect(res.body).toEqual(configResponse);
      expect(backendHttpService.get).toHaveBeenCalledWith('/tenants/lead-form/config');
    });
  });

  describe('updateConfig', () => {
    it('PATCH /v1/tenants/lead-form/config → 200 for MANAGER role, proxies to backend unchanged', async () => {
      setupActiveGuardMock(httpService);
      backendHttpService.patch.mockResolvedValueOnce(configResponse);

      const res = await request(app.getHttpServer())
        .patch('/v1/tenants/lead-form/config')
        .set('Authorization', `Bearer ${makeManagerJwt(jwtService)}`)
        .send({ title: 'Fale com a gente' });

      expect(res.status).toBe(200);
      expect(res.body).toEqual(configResponse);
      expect(backendHttpService.patch).toHaveBeenCalledWith('/tenants/lead-form/config', {
        title: 'Fale com a gente',
      });
    });
  });

  describe('listSubmissions', () => {
    it('GET /v1/tenants/lead-form/submissions → 200 for STAFF role, proxies query params to backend', async () => {
      setupActiveGuardMock(httpService);
      backendHttpService.get.mockResolvedValueOnce(listResponse);

      const res = await request(app.getHttpServer())
        .get('/v1/tenants/lead-form/submissions')
        .query({ page: 1, pageSize: 20 })
        .set('Authorization', `Bearer ${makeStaffJwt(jwtService)}`);

      expect(res.status).toBe(200);
      expect(res.body).toEqual(listResponse);
      expect(backendHttpService.get).toHaveBeenCalledWith('/tenants/lead-form/submissions', {
        page: 1,
        pageSize: 20,
      });
    });

    it('GET /v1/tenants/lead-form/submissions → 403 for CUSTOMER role', async () => {
      const res = await request(app.getHttpServer())
        .get('/v1/tenants/lead-form/submissions')
        .set('Authorization', `Bearer ${makeCustomerJwt(jwtService)}`);
      expect(res.status).toBe(403);
    });
  });

  describe('getSubmission', () => {
    it('GET /v1/tenants/lead-form/submissions/:id → 200 for STAFF role, proxies to backend unchanged', async () => {
      setupActiveGuardMock(httpService);
      backendHttpService.get.mockResolvedValueOnce(detailResponse);

      const res = await request(app.getHttpServer())
        .get(`/v1/tenants/lead-form/submissions/${SUBMISSION_ID}`)
        .set('Authorization', `Bearer ${makeStaffJwt(jwtService)}`);

      expect(res.status).toBe(200);
      expect(res.body).toEqual(detailResponse);
      expect(backendHttpService.get).toHaveBeenCalledWith(
        `/tenants/lead-form/submissions/${SUBMISSION_ID}`,
      );
    });

    it('GET /v1/tenants/lead-form/submissions/:id → 403 for CUSTOMER role', async () => {
      const res = await request(app.getHttpServer())
        .get(`/v1/tenants/lead-form/submissions/${SUBMISSION_ID}`)
        .set('Authorization', `Bearer ${makeCustomerJwt(jwtService)}`);
      expect(res.status).toBe(403);
    });
  });
});
