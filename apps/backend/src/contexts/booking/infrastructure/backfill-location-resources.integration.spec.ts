import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ResourceEntityBuilder } from '../../../test/builders/booking/index';
import { TenantEntityBuilder } from '../../../test/builders/platform/tenant-entity.builder';
import { createBookingIntegrationApp } from '../../../test/utils/booking-integration-app';
import { TenantEntity } from '../../platform/infrastructure/entities/tenant.entity';
import { TenantSettings } from '../../platform/domain/value-objects/tenant-settings.vo';
import { ResourceEntity } from './entities/resource.entity';
import { ResourceType } from '../domain/resource.types';
import { BackfillLocationResources1748500000008 } from './migrations/1748500000008-BackfillLocationResources';

// M21-S02 — direct invocation of the migration's up(queryRunner), not dataSource.runMigrations():
// integration-global-setup.ts already runs every migration (including this one) once, up front,
// against an empty platform.tenants table, so it no-ops before any test seeds a tenant fixture.
const TENANT_EMPTY = '00000000-1102-7000-8000-000000000001';
const TENANT_INACTIVE = '00000000-1102-7000-8000-000000000002';
const TENANT_ALREADY_HAS_LOCATION = '00000000-1102-7000-8000-000000000003';
const TENANT_IDEMPOTENT = '00000000-1102-7000-8000-000000000004';
const TENANT_EN = '00000000-1102-7000-8000-000000000005';

describe('BackfillLocationResources1748500000008 (integration)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let migration: BackfillLocationResources1748500000008;

  beforeAll(async () => {
    ({ app, ds } = await createBookingIntegrationApp());
    migration = new BackfillLocationResources1748500000008();

    await ds.getRepository(TenantEntity).save([
      new TenantEntityBuilder()
        .withId(TENANT_EMPTY)
        .withSlug('backfill-empty')
        .withName('Tenant Sem Recursos')
        .build(),
      new TenantEntityBuilder()
        .withId(TENANT_INACTIVE)
        .withSlug('backfill-inactive')
        .withName('Tenant Inativo')
        .withIsActive(false)
        .build(),
      new TenantEntityBuilder()
        .withId(TENANT_ALREADY_HAS_LOCATION)
        .withSlug('backfill-has-location')
        .withName('Tenant Com LOCATION')
        .build(),
      new TenantEntityBuilder()
        .withId(TENANT_IDEMPOTENT)
        .withSlug('backfill-idempotent')
        .withName('Tenant Idempotente')
        .build(),
      (() => {
        const entity = new TenantEntityBuilder()
          .withId(TENANT_EN)
          .withSlug('backfill-en')
          .withName('Ikaro Demo')
          .build();
        entity.settings = TenantSettings.default('America/New_York', 'US').toJSON();
        return entity;
      })(),
    ]);

    // Defensive case: a tenant that somehow already has an active LOCATION resource
    // before the migration runs — the backfill must not create a second one.
    await ds
      .getRepository(ResourceEntity)
      .save(
        new ResourceEntityBuilder()
          .withTenantId(TENANT_ALREADY_HAS_LOCATION)
          .withType(ResourceType.LOCATION)
          .withRefId(null)
          .withName('Já existente (unidade única)')
          .build(),
      );
  });

  afterAll(async () => {
    await ds.getRepository(ResourceEntity).delete({ tenantId: TENANT_EMPTY });
    await ds.getRepository(ResourceEntity).delete({ tenantId: TENANT_INACTIVE });
    await ds.getRepository(ResourceEntity).delete({ tenantId: TENANT_ALREADY_HAS_LOCATION });
    await ds.getRepository(ResourceEntity).delete({ tenantId: TENANT_IDEMPOTENT });
    await ds.getRepository(ResourceEntity).delete({ tenantId: TENANT_EN });
    await ds.getRepository(TenantEntity).delete({ id: TENANT_EMPTY });
    await ds.getRepository(TenantEntity).delete({ id: TENANT_INACTIVE });
    await ds.getRepository(TenantEntity).delete({ id: TENANT_ALREADY_HAS_LOCATION });
    await ds.getRepository(TenantEntity).delete({ id: TENANT_IDEMPOTENT });
    await ds.getRepository(TenantEntity).delete({ id: TENANT_EN });
    await app.close();
  });

  async function runUp(): Promise<void> {
    const queryRunner = ds.createQueryRunner();
    await queryRunner.connect();
    try {
      await migration.up(queryRunner);
    } finally {
      await queryRunner.release();
    }
  }

  async function runDown(): Promise<void> {
    const queryRunner = ds.createQueryRunner();
    await queryRunner.connect();
    try {
      await migration.down(queryRunner);
    } finally {
      await queryRunner.release();
    }
  }

  it('creates exactly one active LOCATION resource for a tenant with zero resources', async () => {
    await runUp();

    const rows = await ds
      .getRepository(ResourceEntity)
      .find({ where: { tenantId: TENANT_EMPTY, type: ResourceType.LOCATION } });

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      tenantId: TENANT_EMPTY,
      type: ResourceType.LOCATION,
      refId: null,
      name: 'Localização Principal',
      workingHours: null,
      turnoverMinutes: 0,
      maxCapacity: null,
      isActive: true,
    });
  });

  it('backfills an inactive tenant too', async () => {
    await runUp();

    const rows = await ds
      .getRepository(ResourceEntity)
      .find({ where: { tenantId: TENANT_INACTIVE, type: ResourceType.LOCATION } });

    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe('Localização Principal');
  });

  it('names the resource "Main Location" for an en-locale tenant', async () => {
    await runUp();

    const rows = await ds
      .getRepository(ResourceEntity)
      .find({ where: { tenantId: TENANT_EN, type: ResourceType.LOCATION } });

    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe('Main Location');
  });

  it('skips a tenant that already has an active LOCATION resource (idempotency)', async () => {
    await runUp();

    const rows = await ds
      .getRepository(ResourceEntity)
      .find({ where: { tenantId: TENANT_ALREADY_HAS_LOCATION, type: ResourceType.LOCATION } });

    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe('Já existente (unidade única)');
  });

  it('is a no-op when run a second time (idempotency)', async () => {
    await runUp();
    await runUp();

    const rows = await ds
      .getRepository(ResourceEntity)
      .find({ where: { tenantId: TENANT_IDEMPOTENT, type: ResourceType.LOCATION } });

    expect(rows).toHaveLength(1);
  });

  it('scopes each backfilled resource to the exact tenant it was generated for', async () => {
    await runUp();

    const rows = await ds
      .getRepository(ResourceEntity)
      .find({ where: { type: ResourceType.LOCATION } });

    const byTenant = new Map(rows.map((r) => [r.tenantId, r]));
    expect(byTenant.get(TENANT_EMPTY)?.tenantId).toBe(TENANT_EMPTY);
    expect(byTenant.get(TENANT_INACTIVE)?.tenantId).toBe(TENANT_INACTIVE);
    expect(byTenant.get(TENANT_ALREADY_HAS_LOCATION)?.tenantId).toBe(TENANT_ALREADY_HAS_LOCATION);
  });

  it('down() removes every LOCATION resource', async () => {
    await runUp();
    await runDown();

    const rows = await ds
      .getRepository(ResourceEntity)
      .find({ where: { type: ResourceType.LOCATION } });
    expect(rows).toHaveLength(0);

    // Restore so afterAll's per-tenant cleanup and any later test in this file stay consistent
    await runUp();
  });
});
