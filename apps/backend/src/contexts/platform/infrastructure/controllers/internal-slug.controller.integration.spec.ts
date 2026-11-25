import { INestApplication } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { InternalApiGuard } from '../../../../shared/guards/internal-api.guard';
import { createPlatformIntegrationApp } from '../../../../test/utils/platform-integration-app';
import { TenantEntity } from '../entities/tenant.entity';
import { TenantEntityBuilder } from '../../../../test/builders/platform/index';

const INTERNAL_KEY = 'integ-slug-key-integ-slug-key-xxxx'; // ≥ 32 chars
const SUFFIX = Math.random().toString(36).slice(2, 8);
// Random per run: TESTCONTAINERS_REUSE_ENABLE reuses one Postgres across unrelated runs.
const TAKEN_SLUG = `slug-taken-${SUFFIX}`;
const OWNER_SLUG = `ikaro-owner-${SUFFIX}`;

async function startApp(
  ownerSlug: string | undefined,
): Promise<{ app: INestApplication; ds: DataSource }> {
  process.env['INTERNAL_API_KEY'] = INTERNAL_KEY;
  if (ownerSlug === undefined) delete process.env['PLATFORM_OWNER_TENANT_SLUG'];
  else process.env['PLATFORM_OWNER_TENANT_SLUG'] = ownerSlug;
  return createPlatformIntegrationApp({
    extraProviders: [{ provide: APP_GUARD, useClass: InternalApiGuard }],
  });
}

describe('InternalSlugController (integration)', () => {
  describe('with an owner slug configured', () => {
    let app: INestApplication;
    let ds: DataSource;

    const check = (slug: string) =>
      request(app.getHttpServer())
        .get('/internal/signup/slug-availability')
        .query({ slug })
        .set('X-Internal-Key', INTERNAL_KEY);

    beforeAll(async () => {
      ({ app, ds } = await startApp(OWNER_SLUG));
      await ds
        .getRepository(TenantEntity)
        .save(new TenantEntityBuilder().withSlug(TAKEN_SLUG).build());
    });

    afterAll(async () => {
      await ds.getRepository(TenantEntity).delete({ slug: TAKEN_SLUG });
      await app.close();
      delete process.env['INTERNAL_API_KEY'];
      delete process.env['PLATFORM_OWNER_TENANT_SLUG'];
    });

    it('answers taken for a slug a real tenant uses, read live from the database', async () => {
      const { body } = await check(TAKEN_SLUG).expect(200);

      expect(body).toEqual({ status: 'taken' });
    });

    it('answers available for a free slug, and the answer flips as soon as it is taken', async () => {
      const free = `slug-free-${SUFFIX}`;
      expect((await check(free).expect(200)).body).toEqual({ status: 'available' });

      await ds.getRepository(TenantEntity).save(new TenantEntityBuilder().withSlug(free).build());
      try {
        expect((await check(free).expect(200)).body).toEqual({ status: 'taken' });
      } finally {
        await ds.getRepository(TenantEntity).delete({ slug: free });
      }
    });

    it('answers reserved for a reserved word and for the configured owner slug', async () => {
      expect((await check('dashboard').expect(200)).body).toEqual({ status: 'reserved' });
      expect((await check(OWNER_SLUG).expect(200)).body).toEqual({ status: 'reserved' });
    });

    it('answers invalid with a reason', async () => {
      expect((await check('ab').expect(200)).body).toEqual({
        status: 'invalid',
        reason: 'TOO_SHORT',
      });
    });

    it('treats a missing slug as invalid', async () => {
      const { body } = await request(app.getHttpServer())
        .get('/internal/signup/slug-availability')
        .set('X-Internal-Key', INTERNAL_KEY)
        .expect(200);

      expect(body).toEqual({ status: 'invalid', reason: 'TOO_SHORT' });
    });

    it('carries no tenant field: only a status', async () => {
      const { body } = await check(TAKEN_SLUG).expect(200);

      expect(Object.keys(body)).toEqual(['status']);
    });

    it('returns 401 without the internal key', async () => {
      await request(app.getHttpServer())
        .get('/internal/signup/slug-availability')
        .query({ slug: 'lavacar-top' })
        .expect(401);
    });
  });

  describe('with PLATFORM_OWNER_TENANT_SLUG unset', () => {
    let app: INestApplication;

    beforeAll(async () => {
      ({ app } = await startApp(undefined));
    });

    afterAll(async () => {
      await app.close();
      delete process.env['INTERNAL_API_KEY'];
    });

    it('still answers: no owner slug is reserved, the static list still is', async () => {
      const get = (slug: string) =>
        request(app.getHttpServer())
          .get('/internal/signup/slug-availability')
          .query({ slug })
          .set('X-Internal-Key', INTERNAL_KEY)
          .expect(200);

      expect((await get('lavacar-sem-dono')).body).toEqual({ status: 'available' });
      expect((await get('ikaro')).body).toEqual({ status: 'reserved' });
    });
  });
});
