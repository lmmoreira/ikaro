import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { uuidv7 } from '../../../../shared/domain/uuid-v7';
import {
  type ITenantDirectoryPort,
  TENANT_DIRECTORY_PORT,
} from '../../../../shared/ports/tenant-directory.port';
import { TenantEntityBuilder } from '../../../../test/builders/platform/tenant-entity.builder';
import { createPlatformIntegrationApp } from '../../../../test/utils/platform-integration-app';
import { TenantSettings } from '../../domain/value-objects/tenant-settings.vo';
import { TenantEntity } from '../entities/tenant.entity';

function settingsIn(timezone: string) {
  const base = TenantSettings.default().toJSON();
  return { ...base, businessHours: { ...base.businessHours, timezone } };
}

describe('PlatformTenantDirectoryAdapter (integration)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let directory: ITenantDirectoryPort;
  const activeTokyo = uuidv7();
  const activeDefault = uuidv7();
  const inactive = uuidv7();

  beforeAll(async () => {
    ({ app, ds } = await createPlatformIntegrationApp());
    directory = app.get(TENANT_DIRECTORY_PORT);
    await ds
      .getRepository(TenantEntity)
      .save([
        new TenantEntityBuilder()
          .withId(activeTokyo)
          .withSlug(`directory-${activeTokyo}`)
          .withSettings(settingsIn('Asia/Tokyo'))
          .build(),
        new TenantEntityBuilder()
          .withId(activeDefault)
          .withSlug(`directory-${activeDefault}`)
          .build(),
        new TenantEntityBuilder()
          .withId(inactive)
          .withSlug(`directory-${inactive}`)
          .withIsActive(false)
          .build(),
      ]);
  });

  afterAll(async () => {
    await ds
      .getRepository(TenantEntity)
      .delete([{ id: activeTokyo }, { id: activeDefault }, { id: inactive }]);
    await app.close();
  });

  it('lists active tenants with their id and business-hours timezone, and no inactive tenant', async () => {
    const listed = await directory.listActiveTenants();

    expect(listed).toEqual(
      expect.arrayContaining([
        { id: activeTokyo, timezone: 'Asia/Tokyo' },
        { id: activeDefault, timezone: TenantSettings.default().toJSON().businessHours.timezone },
      ]),
    );
    expect(listed.map((tenant) => tenant.id)).not.toContain(inactive);
  });
});
