import { INestApplication } from '@nestjs/common';
import { DataSource, In } from 'typeorm';
import {
  ResourceEntityBuilder,
  ServiceEntityBuilder,
  ServiceResourceRequirementEntityBuilder,
} from '../../../test/builders/booking/index';
import { TenantEntityBuilder } from '../../../test/builders/platform/tenant-entity.builder';
import { createBookingIntegrationApp } from '../../../test/utils/booking-integration-app';
import { TenantEntity } from '../../platform/infrastructure/entities/tenant.entity';
import { TenantSettings } from '../../platform/domain/value-objects/tenant-settings.vo';
import { ResourceEntity } from './entities/resource.entity';
import { ServiceResourceRequirementEntity } from './entities/service-resource-requirement.entity';
import { ServiceEntity } from './entities/service.entity';
import { ResourceType } from '../domain/resource.types';
import { AddServiceResourceRequirementsAndLegs1748500000010 } from './migrations/1748500000010-AddServiceResourceRequirementsAndLegs';

// M22-S01 — direct invocation of the migration's up(queryRunner), same discipline as
// backfill-location-resources.integration.spec.ts: integration-global-setup.ts already runs
// every migration (including this one) once, up front, against an empty services table, so it
// no-ops before any test seeds a service fixture.
const TENANT_NO_LOCATION = '00000000-1110-7000-8000-000000000001';
const TENANT_WITH_LOCATION = '00000000-1110-7000-8000-000000000002';
const TENANT_CUSTOM_BUFFER = '00000000-1110-7000-8000-000000000003';

const FIXTURE_TENANT_IDS = [TENANT_NO_LOCATION, TENANT_WITH_LOCATION, TENANT_CUSTOM_BUFFER];

describe('AddServiceResourceRequirementsAndLegs1748500000010 (integration)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let migration: AddServiceResourceRequirementsAndLegs1748500000010;

  // Deletes in FK-safe order for all 3 fixture tenants at once — used both defensively before
  // seeding (self-heals if a prior run's afterAll never completed, e.g. under CI's
  // TESTCONTAINERS_REUSE_ENABLE) and in afterAll's own teardown, so the two never drift apart
  // into the kind of incomplete list that previously crashed mid-cleanup on an FK violation.
  async function cleanupFixtures(): Promise<void> {
    await ds
      .getRepository(ServiceResourceRequirementEntity)
      .delete({ tenantId: In(FIXTURE_TENANT_IDS) });
    await ds.getRepository(ServiceEntity).delete({ tenantId: In(FIXTURE_TENANT_IDS) });
    await ds.getRepository(ResourceEntity).delete({ tenantId: In(FIXTURE_TENANT_IDS) });
    await ds.getRepository(TenantEntity).delete({ id: In(FIXTURE_TENANT_IDS) });
  }

  beforeAll(async () => {
    ({ app, ds } = await createBookingIntegrationApp());
    migration = new AddServiceResourceRequirementsAndLegs1748500000010();

    await cleanupFixtures();

    await ds.getRepository(TenantEntity).save([
      new TenantEntityBuilder()
        .withId(TENANT_NO_LOCATION)
        .withSlug('backfill-req-no-location')
        .withName('Tenant Sem LOCATION')
        .build(),
      new TenantEntityBuilder()
        .withId(TENANT_WITH_LOCATION)
        .withSlug('backfill-req-with-location')
        .withName('Tenant Com LOCATION')
        .build(),
      (() => {
        const entity = new TenantEntityBuilder()
          .withId(TENANT_CUSTOM_BUFFER)
          .withSlug('backfill-req-custom-buffer')
          .withName('Tenant Buffer Customizado')
          .build();
        const settings = TenantSettings.default('America/Sao_Paulo', 'BR').toJSON();
        entity.settings = {
          ...settings,
          booking: { ...settings.booking, serviceBufferMinutes: 45 },
        };
        return entity;
      })(),
    ]);

    await ds
      .getRepository(ResourceEntity)
      .save(
        new ResourceEntityBuilder()
          .withTenantId(TENANT_WITH_LOCATION)
          .withType(ResourceType.LOCATION)
          .withRefId(null)
          .withName('Localização Principal')
          .build(),
      );
  });

  afterAll(async () => {
    try {
      await cleanupFixtures();
    } finally {
      await app.close();
    }
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

  it('backfills exactly one { LOCATION, NONE } requirement for a service whose tenant has an active LOCATION resource', async () => {
    const service = new ServiceEntityBuilder().withTenantId(TENANT_WITH_LOCATION).build();
    await ds.getRepository(ServiceEntity).save(service);

    await runUp();

    const rows = await ds
      .getRepository(ServiceResourceRequirementEntity)
      .find({ where: { tenantId: TENANT_WITH_LOCATION, serviceId: service.id } });

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      resourceType: ResourceType.LOCATION,
      selectionMode: 'NONE',
      requiredQuantity: 1,
    });
  });

  it('skips a service whose tenant has no active LOCATION resource', async () => {
    const service = new ServiceEntityBuilder().withTenantId(TENANT_NO_LOCATION).build();
    await ds.getRepository(ServiceEntity).save(service);

    await runUp();

    const rows = await ds
      .getRepository(ServiceResourceRequirementEntity)
      .find({ where: { tenantId: TENANT_NO_LOCATION, serviceId: service.id } });

    expect(rows).toHaveLength(0);
  });

  it('does not duplicate a requirement for a service that already has one (idempotency guard)', async () => {
    const service = new ServiceEntityBuilder().withTenantId(TENANT_WITH_LOCATION).build();
    await ds.getRepository(ServiceEntity).save(service);
    await ds
      .getRepository(ServiceResourceRequirementEntity)
      .save(
        new ServiceResourceRequirementEntityBuilder()
          .withTenantId(TENANT_WITH_LOCATION)
          .withServiceId(service.id)
          .withResourceType(ResourceType.EQUIPMENT)
          .withSelectionMode('CUSTOMER_CHOICE')
          .build(),
      );

    await runUp();

    const rows = await ds
      .getRepository(ServiceResourceRequirementEntity)
      .find({ where: { tenantId: TENANT_WITH_LOCATION, serviceId: service.id } });

    expect(rows).toHaveLength(1);
    expect(rows[0].resourceType).toBe(ResourceType.EQUIPMENT);
  });

  it('is a no-op when run a second time (idempotency)', async () => {
    const service = new ServiceEntityBuilder().withTenantId(TENANT_WITH_LOCATION).build();
    await ds.getRepository(ServiceEntity).save(service);

    await runUp();
    await runUp();

    const rows = await ds
      .getRepository(ServiceResourceRequirementEntity)
      .find({ where: { tenantId: TENANT_WITH_LOCATION, serviceId: service.id } });

    expect(rows).toHaveLength(1);
  });

  it("snapshots the tenant's current settings.booking.serviceBufferMinutes onto a service with no buffer yet", async () => {
    const service = new ServiceEntityBuilder()
      .withTenantId(TENANT_CUSTOM_BUFFER)
      .withBufferAfterMinutes(null)
      .build();
    await ds.getRepository(ServiceEntity).save(service);

    await runUp();

    const saved = await ds.getRepository(ServiceEntity).findOneBy({ id: service.id });
    expect(saved!.bufferAfterMinutes).toBe(45);
  });

  it('leaves a service with an already-set bufferAfterMinutes untouched', async () => {
    const service = new ServiceEntityBuilder()
      .withTenantId(TENANT_CUSTOM_BUFFER)
      .withBufferAfterMinutes(90)
      .build();
    await ds.getRepository(ServiceEntity).save(service);

    await runUp();

    const saved = await ds.getRepository(ServiceEntity).findOneBy({ id: service.id });
    expect(saved!.bufferAfterMinutes).toBe(90);
  });
});
