import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import {
  HotsiteConfigEntityBuilder,
  TenantEntityBuilder,
} from '../../../../test/builders/platform';
import { makeLeadFormQuestions as makeQuestions } from '../../../../test/builders/platform/lead-form-config.builder';
import { HotsiteConfigEntity } from '../entities/hotsite-config.entity';
import { LeadFormConfigEntity } from '../entities/lead-form-config.entity';
import { TenantEntity } from '../entities/tenant.entity';
import { createPlatformIntegrationApp } from '../../../../test/utils/platform-integration-app';

const TENANT_A = 'e2d3e4f5-0000-0000-0000-000000000001';
const TENANT_NO_LEAD_FORM = 'e2d3e4f5-0000-0000-0000-000000000002';
const TENANT_STATUS_TRANSITION = 'e2d3e4f5-0000-0000-0000-000000000003';

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

  describe('PATCH /tenants/lead-form/config', () => {
    it('returns 403 when X-Actor-Role is STAFF', async () => {
      const { body } = await request(app.getHttpServer())
        .patch('/tenants/lead-form/config')
        .set('X-Tenant-ID', TENANT_A)
        .set('X-Actor-Role', 'STAFF')
        .send({ title: 'Fale com a gente' })
        .expect(403);

      expect(body.status).toBe(403);
    });

    it('saves teaser fields and questions atomically for a MANAGER', async () => {
      const { body } = await request(app.getHttpServer())
        .patch('/tenants/lead-form/config')
        .set('X-Tenant-ID', TENANT_A)
        .set('X-Actor-Role', 'MANAGER')
        .send({
          title: 'Fale com a gente',
          ctaLabel: 'Preencher formulário',
          audienceMode: 'CUSTOMER_ONLY',
          questions: makeQuestions(1),
        })
        .expect(200);

      expect(body.title).toBe('Fale com a gente');
      expect(body.audienceMode).toBe('CUSTOMER_ONLY');
      expect(body.questions).toHaveLength(1);

      const savedHotsiteConfig = await ds
        .getRepository(HotsiteConfigEntity)
        .findOneBy({ tenantId: TENANT_A });
      const leadFormModule = savedHotsiteConfig!.layout.find((m) => m.type === 'LEAD_FORM');
      expect((leadFormModule?.data as { title: string }).title).toBe('Fale com a gente');

      const savedLeadFormConfig = await ds
        .getRepository(LeadFormConfigEntity)
        .findOneBy({ tenantId: TENANT_A });
      expect(savedLeadFormConfig!.audienceMode).toBe('CUSTOMER_ONLY');
    });

    it('returns 400 PLATFORM_LEAD_FORM_QUESTION_LIMIT_REACHED for 21 questions', async () => {
      const { body } = await request(app.getHttpServer())
        .patch('/tenants/lead-form/config')
        .set('X-Tenant-ID', TENANT_A)
        .set('X-Actor-Role', 'MANAGER')
        .send({ questions: makeQuestions(21) })
        .expect(400);

      expect(body.code).toBe('PLATFORM_LEAD_FORM_QUESTION_LIMIT_REACHED');
    });
  });

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
});
