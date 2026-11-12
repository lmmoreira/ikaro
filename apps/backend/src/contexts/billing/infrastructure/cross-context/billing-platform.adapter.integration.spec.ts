import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { uuidv7 } from '../../../../shared/domain/uuid-v7';
import { TenantEntityBuilder } from '../../../../test/builders/platform';
import { createBillingIntegrationApp } from '../../../../test/utils/billing-integration-app';
import { TenantEntity } from '../../../platform/infrastructure/entities/tenant.entity';
import {
  BILLING_PLATFORM_PORT,
  IBillingPlatformPort,
} from '../../application/ports/billing-platform.port';
import { BillingTenantNotFoundError } from '../../domain/errors/billing-domain.error';

describe('BillingPlatformAdapter (integration)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let port: IBillingPlatformPort;
  const tenantIds: string[] = [];

  beforeAll(async () => {
    ({ app, ds } = await createBillingIntegrationApp());
    port = app.get<IBillingPlatformPort>(BILLING_PLATFORM_PORT);
  });

  afterEach(async () => {
    await ds.query(`DELETE FROM "platform"."tenants" WHERE "id" = ANY($1::uuid[])`, [tenantIds]);
    tenantIds.length = 0;
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns the real tenant’s createdAt, countryCode, timezone and slug through GetTenantBillingInfoUseCase', async () => {
    const tenantId = uuidv7();
    tenantIds.push(tenantId);
    const slug = `adapter-${uuidv7()}`;
    const createdAt = new Date('2026-03-04T05:06:07.000Z');
    await ds
      .getRepository(TenantEntity)
      .insert(
        new TenantEntityBuilder().withId(tenantId).withSlug(slug).withCreatedAt(createdAt).build(),
      );

    const info = await port.getTenantInfo(tenantId);

    expect(info).toEqual({
      tenantId,
      slug,
      countryCode: 'BR',
      timezone: 'America/Sao_Paulo',
      createdAt,
    });
  });

  it('raises a typed not-found, not a transient error, for an unknown tenant id', async () => {
    await expect(port.getTenantInfo(uuidv7())).rejects.toBeInstanceOf(BillingTenantNotFoundError);
  });
});
