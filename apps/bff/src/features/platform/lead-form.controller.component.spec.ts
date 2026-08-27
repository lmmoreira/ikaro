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
  customerId: null,
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

  // Config writes moved to PATCH /v1/tenants/hotsite as of M20-S08 — see
  // hotsite-admin.controller.component.spec.ts's own "audienceMode/questions" coverage.

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

    it('GET .../submissions?search= → 200, forwards the search term unchanged', async () => {
      setupActiveGuardMock(httpService);
      backendHttpService.get.mockResolvedValueOnce(listResponse);

      const res = await request(app.getHttpServer())
        .get('/v1/tenants/lead-form/submissions')
        .query({ page: 1, pageSize: 20, search: 'casado' })
        .set('Authorization', `Bearer ${makeStaffJwt(jwtService)}`);

      expect(res.status).toBe(200);
      expect(backendHttpService.get).toHaveBeenCalledWith('/tenants/lead-form/submissions', {
        page: 1,
        pageSize: 20,
        search: 'casado',
      });
    });

    it('GET .../submissions?search= → 400 GENERIC_VALUE_TOO_SHORT for a search term under 3 chars', async () => {
      setupActiveGuardMock(httpService);

      const res = await request(app.getHttpServer())
        .get('/v1/tenants/lead-form/submissions')
        .query({ page: 1, pageSize: 20, search: 'ab' })
        .set('Authorization', `Bearer ${makeStaffJwt(jwtService)}`);

      expect(res.status).toBe(400);
      expect(res.body.violations).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ field: 'search', code: 'GENERIC_VALUE_TOO_SHORT' }),
        ]),
      );
    });

    it('GET .../submissions?filters= → 200, round-trips the JSON-encoded array to the backend unchanged', async () => {
      setupActiveGuardMock(httpService);
      backendHttpService.get.mockResolvedValueOnce(listResponse);
      const filters = [{ questionLabel: 'Estado civil', value: 'casado' }];

      const res = await request(app.getHttpServer())
        .get('/v1/tenants/lead-form/submissions')
        .query({ page: 1, pageSize: 20, filters: JSON.stringify(filters) })
        .set('Authorization', `Bearer ${makeStaffJwt(jwtService)}`);

      expect(res.status).toBe(200);
      expect(backendHttpService.get).toHaveBeenCalledWith('/tenants/lead-form/submissions', {
        page: 1,
        pageSize: 20,
        filters: JSON.stringify(filters),
      });
    });

    it('GET .../submissions?search=&filters= → 400 GENERIC_VALUE_INVALID when both are present', async () => {
      setupActiveGuardMock(httpService);

      const res = await request(app.getHttpServer())
        .get('/v1/tenants/lead-form/submissions')
        .query({
          page: 1,
          pageSize: 20,
          search: 'casado',
          filters: JSON.stringify([{ questionLabel: 'Estado civil', value: 'casado' }]),
        })
        .set('Authorization', `Bearer ${makeStaffJwt(jwtService)}`);

      expect(res.status).toBe(400);
      expect(res.body.violations).toEqual(
        expect.arrayContaining([expect.objectContaining({ code: 'GENERIC_VALUE_INVALID' })]),
      );
    });

    it('GET .../submissions?submittedFrom=&submittedTo= → 400 GENERIC_VALUE_OUT_OF_RANGE when From is after To', async () => {
      setupActiveGuardMock(httpService);

      const res = await request(app.getHttpServer())
        .get('/v1/tenants/lead-form/submissions')
        .query({
          page: 1,
          pageSize: 20,
          submittedFrom: '2026-02-01',
          submittedTo: '2026-01-01',
        })
        .set('Authorization', `Bearer ${makeStaffJwt(jwtService)}`);

      expect(res.status).toBe(400);
      expect(res.body.violations).toEqual(
        expect.arrayContaining([expect.objectContaining({ code: 'GENERIC_VALUE_OUT_OF_RANGE' })]),
      );
    });
  });

  describe('getFilterOptions', () => {
    it('GET /v1/tenants/lead-form/submissions/filter-options → 200 for STAFF role, not captured by the :id route', async () => {
      setupActiveGuardMock(httpService);
      backendHttpService.get.mockResolvedValueOnce({
        questionLabels: ['Estado civil', 'Onde mora'],
      });

      const res = await request(app.getHttpServer())
        .get('/v1/tenants/lead-form/submissions/filter-options')
        .set('Authorization', `Bearer ${makeStaffJwt(jwtService)}`);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ questionLabels: ['Estado civil', 'Onde mora'] });
      expect(backendHttpService.get).toHaveBeenCalledWith(
        '/tenants/lead-form/submissions/filter-options',
      );
    });

    it('GET /v1/tenants/lead-form/submissions/filter-options → 403 for CUSTOMER role', async () => {
      const res = await request(app.getHttpServer())
        .get('/v1/tenants/lead-form/submissions/filter-options')
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
