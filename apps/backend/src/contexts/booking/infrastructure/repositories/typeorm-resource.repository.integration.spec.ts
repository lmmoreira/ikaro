import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ResourceBuilder, ResourceEntityBuilder } from '../../../../test/builders/booking/index';
import { createBookingIntegrationApp } from '../../../../test/utils/booking-integration-app';
import { RESOURCE_REPOSITORY } from '../../application/ports/resource-repository.port';
import { ResourceType } from '../../domain/resource.types';
import { ResourceEntity } from '../entities/resource.entity';
import { TypeOrmResourceRepository } from './typeorm-resource.repository';

const TENANT_ID = '10000000-0000-4000-8000-000000000600';
const OTHER_TENANT_ID = '10000000-0000-4000-8000-000000000601';
const STAFF_ID = '20000000-0000-4000-8000-000000000010';

describe('TypeOrmResourceRepository (integration)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let repo: TypeOrmResourceRepository;

  beforeAll(async () => {
    const created = await createBookingIntegrationApp();
    app = created.app;
    ds = created.ds;
    repo = created.moduleRef.get(RESOURCE_REPOSITORY, { strict: false });
  });

  afterAll(async () => {
    await app.close();
  });

  it('round-trips all fields through save/findById', async () => {
    const resource = new ResourceBuilder()
      .withTenantId(TENANT_ID)
      .withType(ResourceType.ROOM)
      .withName('Estúdio 1')
      .withMaxCapacity(12)
      .withTurnoverMinutes(15)
      .withWorkingHours({
        monday: { open: '10:00', close: '16:00' },
        tuesday: null,
        wednesday: null,
        thursday: null,
        friday: null,
        saturday: null,
        sunday: null,
      })
      .build();

    await repo.save(resource);
    const found = await repo.findById(resource.id, TENANT_ID);

    expect(found).not.toBeNull();
    expect(found!.name).toBe('Estúdio 1');
    expect(found!.maxCapacity).toBe(12);
    expect(found!.turnoverMinutes).toBe(15);
    expect(found!.workingHours?.monday).toEqual({ open: '10:00', close: '16:00' });
  });

  it('enforces UNIQUE(tenant_id, ref_id) WHERE type=STAFF — one Resource per staff member', async () => {
    const first = new ResourceBuilder()
      .withTenantId(TENANT_ID)
      .withType(ResourceType.STAFF)
      .withRefId(STAFF_ID)
      .build();
    await repo.save(first);

    const duplicate = new ResourceBuilder()
      .withTenantId(TENANT_ID)
      .withType(ResourceType.STAFF)
      .withRefId(STAFF_ID)
      .build();

    await expect(repo.save(duplicate)).rejects.toThrow();
  });

  it('allows the same staff member to be wrapped in different tenants', async () => {
    const inTenantA = new ResourceBuilder()
      .withTenantId(TENANT_ID)
      .withType(ResourceType.STAFF)
      .withRefId('20000000-0000-4000-8000-000000000011')
      .build();
    const inTenantB = new ResourceBuilder()
      .withTenantId(OTHER_TENANT_ID)
      .withType(ResourceType.STAFF)
      .withRefId('20000000-0000-4000-8000-000000000011')
      .build();

    await repo.save(inTenantA);
    await expect(repo.save(inTenantB)).resolves.toBeUndefined();
  });

  it('enforces UNIQUE(tenant_id) WHERE type=LOCATION AND is_active — one active LOCATION per tenant', async () => {
    // LOCATION resources are backfilled (S02), not created through the aggregate's own
    // application-level rejection — this proves the DB constraint is the real authority,
    // independent of the app-level "LOCATION is never created through this use case" rule.
    const first = new ResourceEntityBuilder()
      .withTenantId(TENANT_ID)
      .withType(ResourceType.LOCATION)
      .withName('Unidade Única')
      .build();
    await ds.getRepository(ResourceEntity).save(first);

    const second = new ResourceEntityBuilder()
      .withTenantId(TENANT_ID)
      .withType(ResourceType.LOCATION)
      .withName('Unidade Única (duplicate)')
      .build();

    await expect(ds.getRepository(ResourceEntity).insert(second)).rejects.toThrow();
  });
});
