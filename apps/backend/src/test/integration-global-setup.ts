import 'reflect-metadata';
import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { GenericContainer, Wait } from 'testcontainers';
import { DataSource } from 'typeorm';
import { CustomerEntity } from '../contexts/customer/infrastructure/entities/customer.entity';
import { CreateCustomerCustomers1716600000001 } from '../contexts/customer/infrastructure/migrations/1716600000001-CreateCustomerCustomers';
import { AddCustomerTenantOAuthUniqueConstraint1748000000002 } from '../contexts/customer/infrastructure/migrations/1748000000002-AddCustomerTenantOAuthUniqueConstraint';
import { HotsiteConfigEntity } from '../contexts/platform/infrastructure/entities/hotsite-config.entity';
import { TenantEntity } from '../contexts/platform/infrastructure/entities/tenant.entity';
import { CreatePlatformHotsiteConfigs1716500000002 } from '../contexts/platform/infrastructure/migrations/1716500000002-CreatePlatformHotsiteConfigs';
import { CreatePlatformTenants1716500000001 } from '../contexts/platform/infrastructure/migrations/1716500000001-CreatePlatformTenants';
import { StaffEntity } from '../contexts/staff/infrastructure/entities/staff.entity';
import { CreateStaffStaff1716600000002 } from '../contexts/staff/infrastructure/migrations/1716600000002-CreateStaffStaff';
import { AddNameToStaff1716600000003 } from '../contexts/staff/infrastructure/migrations/1716600000003-AddNameToStaff';
import { AddUniqueEmailPerTenant1716600000004 } from '../contexts/staff/infrastructure/migrations/1716600000004-AddUniqueEmailPerTenant';
import { AddInvitedByDeactivatedByToStaff1748000000001 } from '../contexts/staff/infrastructure/migrations/1748000000001-AddInvitedByDeactivatedByToStaff';

export default async function globalSetup(): Promise<void> {
  const [pgContainer, pubsubContainer] = await Promise.all([
    new PostgreSqlContainer('postgres:15-alpine').start(),
    new GenericContainer('gcr.io/google.com/cloudsdktool/google-cloud-cli:emulators')
      .withCommand([
        'gcloud',
        'beta',
        'emulators',
        'pubsub',
        'start',
        '--host-port=0.0.0.0:8085',
        '--project=beloauto-local',
      ])
      .withExposedPorts(8085)
      .withWaitStrategy(Wait.forLogMessage('INFO: Server started', 1))
      .start(),
  ]);

  process.env['TEST_DATABASE_URL'] = pgContainer.getConnectionUri();
  process.env['PUBSUB_EMULATOR_HOST'] =
    `${pubsubContainer.getHost()}:${pubsubContainer.getMappedPort(8085)}`;
  process.env['PUBSUB_PROJECT_ID'] = 'beloauto-local';

  (globalThis as Record<string, unknown>)['__TC_PG_CONTAINER__'] = pgContainer;
  (globalThis as Record<string, unknown>)['__TC_PUBSUB_CONTAINER__'] = pubsubContainer;

  const ds = new DataSource({
    type: 'postgres',
    url: pgContainer.getConnectionUri(),
    entities: [TenantEntity, HotsiteConfigEntity, CustomerEntity, StaffEntity],
    migrations: [
      CreatePlatformTenants1716500000001,
      CreatePlatformHotsiteConfigs1716500000002,
      CreateCustomerCustomers1716600000001,
      AddCustomerTenantOAuthUniqueConstraint1748000000002,
      CreateStaffStaff1716600000002,
      AddNameToStaff1716600000003,
      AddUniqueEmailPerTenant1716600000004,
      AddInvitedByDeactivatedByToStaff1748000000001,
    ],
    synchronize: false,
    migrationsRun: false,
  });

  await ds.initialize();
  await ds.query(`CREATE SCHEMA IF NOT EXISTS "platform"`);
  await ds.runMigrations();
  await ds.destroy();
}
