import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import {
  HotsiteConfigEntityBuilder,
  TenantEntityBuilder,
} from '../../../../test/builders/platform';
import { STORAGE_SERVICE, IStorageService } from '../../../../shared/ports/storage.service.port';
import { HotsiteConfigEntity } from '../entities/hotsite-config.entity';
import { TenantEntity } from '../entities/tenant.entity';
import { createPlatformIntegrationApp } from '../../../../test/utils/platform-integration-app';

// Exercises the real promotion + delete-previous-on-replace flow against the real GCS emulator
// (see integration-global-setup.ts and gcs-signed-url.adapter.integration.spec.ts) — every other
// hotsite-admin integration spec uses InMemoryStorageService, which proves the business logic but
// never proves the actual bucket-to-bucket copy/delete calls work against a real backend. This
// file scopes to exactly that: does a `tmp/` upload really end up promoted, at the real permanent
// path, in the real public bucket, with the real tmp object and the real superseded object gone.
// See td/TD22-ORPHANED-UPLOAD-CLEANUP.md.

const TENANT_A = 'c3d4e5f6-0000-0000-0000-000000000001';

describe('HotsiteAdminController (integration — real GCS promotion)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let storageService: IStorageService;
  const oldPermanentLogoPath = `tenants/${TENANT_A}/hotsite/branding/old-uuid/old-logo.png`;

  beforeAll(async () => {
    ({ app, ds } = await createPlatformIntegrationApp({ useRealStorage: true }));
    storageService = app.get(STORAGE_SERVICE);

    await ds
      .getRepository(TenantEntity)
      .save(new TenantEntityBuilder().withId(TENANT_A).withSlug('gcs-promotion-tenant-a').build());

    // Seed an existing "already-permanent" logo, real object in the real public bucket, so the
    // save below has something genuine to supersede-and-delete.
    const config = new HotsiteConfigEntityBuilder()
      .withId(`d${TENANT_A.slice(1)}`)
      .withTenantId(TENANT_A)
      .withIsPublished(false)
      .withBranding({ logoUrl: oldPermanentLogoPath })
      .build();
    await ds.getRepository(HotsiteConfigEntity).save(config);

    const { signedUrl: oldLogoUploadUrl } = await storageService.generateWriteSignedUrl(
      oldPermanentLogoPath,
      'image/png',
      'public',
    );
    await fetch(oldLogoUploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'image/png' },
      body: 'old-logo-bytes',
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it('promotes a tmp/-uploaded logo to its permanent public path and deletes the superseded logo — for real', async () => {
    // Step 1 — generate the tmp/ staging signed URL, exactly as the frontend would.
    const { body: signedUrlBody } = await request(app.getHttpServer())
      .post('/tenants/hotsite/images/signed-url')
      .set('X-Tenant-ID', TENANT_A)
      .set('X-Actor-Role', 'MANAGER')
      .send({ fileName: 'new-logo.png', contentType: 'image/png', purpose: 'branding' })
      .expect(201);

    const tmpFilePath: string = signedUrlBody.filePath;
    expect(tmpFilePath.startsWith(`tmp/${TENANT_A}/branding/`)).toBe(true);

    // Step 2 — actually PUT the file, exactly as the browser would.
    const putRes = await fetch(signedUrlBody.signedUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'image/png' },
      body: 'new-logo-bytes',
    });
    expect(putRes.status).toBe(200);

    // Sanity: it's real, it's in the private bucket, and it hasn't been promoted yet.
    await expect(storageService.exists(tmpFilePath, 'private')).resolves.toBe(true);
    await expect(storageService.exists(tmpFilePath, 'public')).resolves.toBe(false);

    // Step 3 — save, triggering real promotion (prepareImagePromotion + scheduleAfterCommit).
    const { body: patchBody } = await request(app.getHttpServer())
      .patch('/tenants/hotsite')
      .set('X-Tenant-ID', TENANT_A)
      .set('X-Actor-Role', 'MANAGER')
      .send({ branding: { logoUrl: tmpFilePath } })
      .expect(200);

    const promotedPath: string = patchBody.branding.logoUrl;
    expect(promotedPath.startsWith(`tenants/${TENANT_A}/hotsite/branding/`)).toBe(true);
    expect(promotedPath).not.toBe(oldPermanentLogoPath);

    // Step 4 — verify against the REAL bucket: promoted object exists (public), tmp original is
    // gone (private), and the superseded old permanent object is gone too (public).
    await expect(storageService.exists(promotedPath, 'public')).resolves.toBe(true);
    await expect(storageService.exists(tmpFilePath, 'private')).resolves.toBe(false);
    await expect(storageService.exists(oldPermanentLogoPath, 'public')).resolves.toBe(false);

    const saved = await ds
      .getRepository(HotsiteConfigEntity)
      .findOne({ where: { tenantId: TENANT_A } });
    expect(saved!.branding.logoUrl).toBe(promotedPath);
  });
});
