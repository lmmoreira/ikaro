import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import {
  HotsiteConfigEntityBuilder,
  TenantEntityBuilder,
} from '../../../../test/builders/platform';
import { LeadFormSubmissionEntityBuilder } from '../../../../test/builders/platform/lead-form-submission-entity.builder';
import { HotsiteConfigEntity } from '../entities/hotsite-config.entity';
import { LeadFormSubmissionEntity } from '../entities/lead-form-submission.entity';
import { TenantEntity } from '../entities/tenant.entity';
import { createPlatformIntegrationApp } from '../../../../test/utils/platform-integration-app';

const TENANT_A = 'e2d3e4f5-0000-0000-0000-000000000001';
const TENANT_NO_LEAD_FORM = 'e2d3e4f5-0000-0000-0000-000000000002';
const TENANT_STATUS_TRANSITION = 'e2d3e4f5-0000-0000-0000-000000000003';
const TENANT_SUBMISSIONS = 'e2d3e4f5-0000-0000-0000-000000000004';
const TENANT_SUBMISSIONS_OTHER = 'e2d3e4f5-0000-0000-0000-000000000005';

describe('LeadFormController (integration)', () => {
  let app: INestApplication;
  let ds: DataSource;

  beforeAll(async () => {
    ({ app, ds } = await createPlatformIntegrationApp());

    await ds
      .getRepository(TenantEntity)
      .save(new TenantEntityBuilder().withId(TENANT_A).withSlug('lead-form-ctrl-tenant-a').build());
    await ds
      .getRepository(TenantEntity)
      .save(
        new TenantEntityBuilder()
          .withId(TENANT_NO_LEAD_FORM)
          .withSlug('lead-form-ctrl-tenant-b')
          .build(),
      );

    await ds
      .getRepository(HotsiteConfigEntity)
      .save(new HotsiteConfigEntityBuilder().withTenantId(TENANT_A).build());
    await ds
      .getRepository(HotsiteConfigEntity)
      .save(new HotsiteConfigEntityBuilder().withTenantId(TENANT_NO_LEAD_FORM).build());

    await ds
      .getRepository(TenantEntity)
      .save(
        new TenantEntityBuilder()
          .withId(TENANT_STATUS_TRANSITION)
          .withSlug('lead-form-ctrl-tenant-c')
          .build(),
      );
    await ds
      .getRepository(HotsiteConfigEntity)
      .save(new HotsiteConfigEntityBuilder().withTenantId(TENANT_STATUS_TRANSITION).build());

    await ds
      .getRepository(TenantEntity)
      .save(
        new TenantEntityBuilder()
          .withId(TENANT_SUBMISSIONS)
          .withSlug('lead-form-ctrl-tenant-d')
          .build(),
      );
    await ds
      .getRepository(TenantEntity)
      .save(
        new TenantEntityBuilder()
          .withId(TENANT_SUBMISSIONS_OTHER)
          .withSlug('lead-form-ctrl-tenant-e')
          .build(),
      );

    for (let i = 0; i < 25; i++) {
      await ds.getRepository(LeadFormSubmissionEntity).save(
        new LeadFormSubmissionEntityBuilder()
          .withTenantId(TENANT_SUBMISSIONS)
          .withName(`Lead ${i}`)
          .withSubmittedAt(new Date(Date.UTC(2026, 0, 1, 0, 0, i)))
          .build(),
      );
    }
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /tenants/lead-form/config', () => {
    it('returns 403 when X-Actor-Role is STAFF', async () => {
      const { body } = await request(app.getHttpServer())
        .get('/tenants/lead-form/config')
        .set('X-Tenant-ID', TENANT_A)
        .set('X-Actor-Role', 'STAFF')
        .expect(403);

      expect(body.status).toBe(403);
    });

    it('returns the { title: "", ctaLabel: "" } default when no LEAD_FORM entry exists yet', async () => {
      const { body } = await request(app.getHttpServer())
        .get('/tenants/lead-form/config')
        .set('X-Tenant-ID', TENANT_NO_LEAD_FORM)
        .set('X-Actor-Role', 'MANAGER')
        .expect(200);

      expect(body.title).toBe('');
      expect(body.ctaLabel).toBe('');
      expect(body.audienceMode).toBe('GUEST_AND_CUSTOMER');
      expect(body.questions).toEqual([]);
    });
  });

  // Config writes moved to PATCH /tenants/hotsite as of M20-S08 — see
  // hotsite-admin.controller.integration.spec.ts's own "audienceMode/questions" describe block.

  describe('GET /tenants/lead-form/status', () => {
    it('returns { enabled: false } for a tenant that has never enabled the module, readable by STAFF', async () => {
      const { body } = await request(app.getHttpServer())
        .get('/tenants/lead-form/status')
        .set('X-Tenant-ID', TENANT_NO_LEAD_FORM)
        .set('X-Actor-Role', 'STAFF')
        .expect(200);

      expect(body).toEqual({ enabled: false });
    });

    it('returns { enabled: false } for a tenant that has never enabled the module, readable by MANAGER', async () => {
      const { body } = await request(app.getHttpServer())
        .get('/tenants/lead-form/status')
        .set('X-Tenant-ID', TENANT_NO_LEAD_FORM)
        .set('X-Actor-Role', 'MANAGER')
        .expect(200);

      expect(body).toEqual({ enabled: false });
    });

    it('returns { enabled: true } after the module is enabled via PATCH /v1/tenants/hotsite', async () => {
      const before = await request(app.getHttpServer())
        .get('/tenants/lead-form/status')
        .set('X-Tenant-ID', TENANT_STATUS_TRANSITION)
        .set('X-Actor-Role', 'MANAGER')
        .expect(200);
      expect(before.body).toEqual({ enabled: false });

      await request(app.getHttpServer())
        .patch('/tenants/hotsite')
        .set('X-Tenant-ID', TENANT_STATUS_TRANSITION)
        .set('X-Actor-Role', 'MANAGER')
        .send({
          layout: [
            {
              type: 'HERO',
              enabled: true,
              data: {
                variant: 'centered',
                title: 'Cuidado completo para o seu carro',
                ctaLabel: 'Agendar agora',
                ctaTarget: 'booking-form',
              },
            },
            {
              type: 'LEAD_FORM',
              enabled: true,
              data: { title: 'Fale com a gente', ctaLabel: 'Preencher formulário' },
            },
          ],
        })
        .expect(200);

      const after = await request(app.getHttpServer())
        .get('/tenants/lead-form/status')
        .set('X-Tenant-ID', TENANT_STATUS_TRANSITION)
        .set('X-Actor-Role', 'MANAGER')
        .expect(200);
      expect(after.body).toEqual({ enabled: true });
    });
  });

  describe('GET /tenants/lead-form/submissions', () => {
    it('paginates correctly, ordered submittedAt DESC, readable by STAFF', async () => {
      const page1 = await request(app.getHttpServer())
        .get('/tenants/lead-form/submissions')
        .query({ page: 1, pageSize: 20 })
        .set('X-Tenant-ID', TENANT_SUBMISSIONS)
        .set('X-Actor-Role', 'STAFF')
        .expect(200);

      expect(page1.body.items).toHaveLength(20);
      expect(page1.body.page).toBe(1);
      expect(page1.body.pageSize).toBe(20);
      expect(page1.body.total).toBe(25);
      expect(page1.body.items[0].name).toBe('Lead 24');
      expect(page1.body.items[0]).toEqual(
        expect.objectContaining({ email: 'lead@example.com', phone: '+5511912345678' }),
      );

      const page2 = await request(app.getHttpServer())
        .get('/tenants/lead-form/submissions')
        .query({ page: 2, pageSize: 20 })
        .set('X-Tenant-ID', TENANT_SUBMISSIONS)
        .set('X-Actor-Role', 'MANAGER')
        .expect(200);

      expect(page2.body.items).toHaveLength(5);
      expect(page2.body.total).toBe(25);
      expect(page2.body.items[0].name).toBe('Lead 4');
    });

    it("tenant isolation — never returns tenant A's submissions when listing as tenant B", async () => {
      const { body } = await request(app.getHttpServer())
        .get('/tenants/lead-form/submissions')
        .set('X-Tenant-ID', TENANT_SUBMISSIONS_OTHER)
        .set('X-Actor-Role', 'MANAGER')
        .expect(200);

      expect(body.items).toEqual([]);
      expect(body.total).toBe(0);
    });
  });

  describe('GET /tenants/lead-form/submissions/:id', () => {
    it('returns the full answers snapshot, readable by STAFF', async () => {
      const submission = new LeadFormSubmissionEntityBuilder()
        .withTenantId(TENANT_SUBMISSIONS)
        .withName('Detail Lead')
        .withAnswers([
          {
            questionId: 'q1',
            questionLabel: 'Como conheceu a loja?',
            questionType: 'SINGLE_CHOICE',
            answerValue: 'Instagram',
          },
        ])
        .build();
      await ds.getRepository(LeadFormSubmissionEntity).save(submission);

      const { body } = await request(app.getHttpServer())
        .get(`/tenants/lead-form/submissions/${submission.id}`)
        .set('X-Tenant-ID', TENANT_SUBMISSIONS)
        .set('X-Actor-Role', 'STAFF')
        .expect(200);

      expect(body.id).toBe(submission.id);
      expect(body.name).toBe('Detail Lead');
      expect(body.answers).toEqual([
        {
          questionLabel: 'Como conheceu a loja?',
          questionType: 'SINGLE_CHOICE',
          answerValue: 'Instagram',
        },
      ]);
    });

    it('returns 404 PLATFORM_LEAD_FORM_SUBMISSION_NOT_FOUND for an unknown id', async () => {
      const { body } = await request(app.getHttpServer())
        .get('/tenants/lead-form/submissions/01234567-0000-7000-8000-000000000099')
        .set('X-Tenant-ID', TENANT_SUBMISSIONS)
        .set('X-Actor-Role', 'MANAGER')
        .expect(404);

      expect(body.code).toBe('PLATFORM_LEAD_FORM_SUBMISSION_NOT_FOUND');
    });

    it('tenant isolation — 404s when the submission belongs to a different tenant', async () => {
      const submission = new LeadFormSubmissionEntityBuilder()
        .withTenantId(TENANT_SUBMISSIONS)
        .withName('Cross Tenant Lead')
        .build();
      await ds.getRepository(LeadFormSubmissionEntity).save(submission);

      const { body } = await request(app.getHttpServer())
        .get(`/tenants/lead-form/submissions/${submission.id}`)
        .set('X-Tenant-ID', TENANT_SUBMISSIONS_OTHER)
        .set('X-Actor-Role', 'MANAGER')
        .expect(404);

      expect(body.code).toBe('PLATFORM_LEAD_FORM_SUBMISSION_NOT_FOUND');
    });
  });
});
