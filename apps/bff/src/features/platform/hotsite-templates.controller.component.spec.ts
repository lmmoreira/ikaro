import { HttpException, INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { ApplyHotsiteTemplateResponse, HotsiteTemplateSummaryResponse } from '@ikaro/types';
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

const summaries: HotsiteTemplateSummaryResponse[] = [
  {
    id: 'origem',
    version: 1,
    thumbnailUrl: 'https://storage.example.com/ikaro-public-staging/shared/x/thumbnail.webp',
    capabilities: ['navigation'],
  },
];

const applied: ApplyHotsiteTemplateResponse = {
  content: {
    branding: {
      primaryColor: '#2563EB',
      secondaryColor: '#EFF6FF',
      backgroundColor: '#FFFFFF',
      textColor: '#111827',
      headingFontFamily: 'Inter, sans-serif',
      bodyFontFamily: 'Inter, sans-serif',
      logoUrl: '',
      borderRadius: 'rounded',
      buttonStyle: 'filled',
      spacing: 'comfortable',
      shadowStyle: 'subtle',
    },
    layout: [],
    seo: { title: null, description: null, ogImageUrl: '' },
  },
  appliedTemplate: { id: 'origem', version: 1 },
  appliedSampleTestimonials: false,
};

describe('HotsiteTemplatesController (component)', () => {
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

  describe("authentication and role gates (class-level @Roles('MANAGER'))", () => {
    it('GET /v1/tenants/hotsite/templates → 401 without a token', async () => {
      const res = await request(app.getHttpServer()).get('/v1/tenants/hotsite/templates');
      expect(res.status).toBe(401);
    });

    it('GET /v1/tenants/hotsite/templates → 403 for STAFF', async () => {
      setupActiveGuardMock(httpService);
      const res = await request(app.getHttpServer())
        .get('/v1/tenants/hotsite/templates')
        .set('Authorization', `Bearer ${makeStaffJwt(jwtService)}`);
      expect(res.status).toBe(403);
    });

    it('POST /v1/tenants/hotsite/templates/origem/apply → 403 for CUSTOMER', async () => {
      const res = await request(app.getHttpServer())
        .post('/v1/tenants/hotsite/templates/origem/apply')
        .set('Authorization', `Bearer ${makeCustomerJwt(jwtService)}`)
        .send({ content: { layout: [] } });
      expect(res.status).toBe(403);
      expect(backendHttpService.post).not.toHaveBeenCalled();
    });
  });

  describe('listTemplates', () => {
    it('GET /v1/tenants/hotsite/templates → 200 with a plain array', async () => {
      setupActiveGuardMock(httpService);
      backendHttpService.get.mockResolvedValueOnce({ templates: summaries });

      const res = await request(app.getHttpServer())
        .get('/v1/tenants/hotsite/templates')
        .set('Authorization', `Bearer ${makeManagerJwt(jwtService)}`);

      expect(res.status).toBe(200);
      expect(res.body).toEqual(summaries);
      expect(backendHttpService.get).toHaveBeenCalledWith('/tenants/hotsite/templates');
    });
  });

  describe('applyTemplate', () => {
    it('POST /v1/tenants/hotsite/templates/origem/apply → 200, defaults branding and seo, forwards the draft', async () => {
      setupActiveGuardMock(httpService);
      backendHttpService.post.mockResolvedValueOnce(applied);

      const res = await request(app.getHttpServer())
        .post('/v1/tenants/hotsite/templates/origem/apply')
        .set('Authorization', `Bearer ${makeManagerJwt(jwtService)}`)
        .send({ content: { layout: [] } });

      expect(res.status).toBe(200);
      expect(res.body.appliedTemplate).toEqual({ id: 'origem', version: 1 });
      expect(backendHttpService.post).toHaveBeenCalledWith(
        '/tenants/hotsite/templates/origem/apply',
        { content: { branding: {}, layout: [], seo: {} } },
      );
    });

    it('POST → 400 when the draft has no layout, without calling the backend', async () => {
      setupActiveGuardMock(httpService);

      const res = await request(app.getHttpServer())
        .post('/v1/tenants/hotsite/templates/origem/apply')
        .set('Authorization', `Bearer ${makeManagerJwt(jwtService)}`)
        .send({ content: {} });

      expect(res.status).toBe(400);
      expect(backendHttpService.post).not.toHaveBeenCalled();
    });

    it('POST → 400 for a template id that is not a catalogue slug, without calling the backend', async () => {
      setupActiveGuardMock(httpService);

      const res = await request(app.getHttpServer())
        .post('/v1/tenants/hotsite/templates/Not_A_Slug/apply')
        .set('Authorization', `Bearer ${makeManagerJwt(jwtService)}`)
        .send({ content: { layout: [] } });

      expect(res.status).toBe(400);
      expect(backendHttpService.post).not.toHaveBeenCalled();
    });

    it('POST → forwards the backend 404 for an unknown template', async () => {
      setupActiveGuardMock(httpService);
      backendHttpService.post.mockRejectedValueOnce(
        new HttpException({ status: 404, detail: 'template not found' }, 404),
      );

      const res = await request(app.getHttpServer())
        .post('/v1/tenants/hotsite/templates/unknown/apply')
        .set('Authorization', `Bearer ${makeManagerJwt(jwtService)}`)
        .send({ content: { layout: [] } });

      expect(res.status).toBe(404);
    });
  });
});
