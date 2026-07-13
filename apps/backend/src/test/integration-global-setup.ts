import { PostgreSqlContainer } from '@testcontainers/postgresql';
import { GenericContainer, Wait } from 'testcontainers';
import { Storage } from '@google-cloud/storage';
import { readFileSync } from 'fs';
import { join } from 'path';
import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { BookingLineEntity } from '../contexts/booking/infrastructure/entities/booking-line.entity';
import { BookingEntity } from '../contexts/booking/infrastructure/entities/booking.entity';
import { ScheduleClosureEntity } from '../contexts/booking/infrastructure/entities/schedule-closure.entity';
import { ScheduleOpeningEntity } from '../contexts/booking/infrastructure/entities/schedule-opening.entity';
import { ServiceEntity } from '../contexts/booking/infrastructure/entities/service.entity';
import { CreateBookingServices1748000000011 } from '../contexts/booking/infrastructure/migrations/1748000000011-CreateBookingServices';
import { CreateBookingScheduleClosures1748000000012 } from '../contexts/booking/infrastructure/migrations/1748000000012-CreateBookingScheduleClosures';
import { CreateBookingScheduleOpenings1748000000013 } from '../contexts/booking/infrastructure/migrations/1748000000013-CreateBookingScheduleOpenings';
import { CreateBookingBookings1748000000014 } from '../contexts/booking/infrastructure/migrations/1748000000014-CreateBookingBookings';
import { CustomerEntity } from '../contexts/customer/infrastructure/entities/customer.entity';
import { CreateCustomerCustomers1716600000001 } from '../contexts/customer/infrastructure/migrations/1716600000001-CreateCustomerCustomers';
import { AddCustomerTenantOAuthUniqueConstraint1748000000002 } from '../contexts/customer/infrastructure/migrations/1748000000002-AddCustomerTenantOAuthUniqueConstraint';
import { BalanceExpiryLogEntity } from '../contexts/loyalty/infrastructure/entities/balance-expiry-log.entity';
import { LoyaltyBalanceEntity } from '../contexts/loyalty/infrastructure/entities/loyalty-balance.entity';
import { LoyaltyEntryEntity } from '../contexts/loyalty/infrastructure/entities/loyalty-entry.entity';
import { LoyaltyRedemptionEntity } from '../contexts/loyalty/infrastructure/entities/loyalty-redemption.entity';
import { CreateLoyaltyLoyaltyEntries1748000000016 } from '../contexts/loyalty/infrastructure/migrations/1748000000016-CreateLoyaltyLoyaltyEntries';
import { CreateLoyaltyBalancesRedemptionsExpiryLog1748000000017 } from '../contexts/loyalty/infrastructure/migrations/1748000000017-CreateLoyaltyBalancesRedemptionsExpiryLog';
import { AddLoyaltyRedemptionPointsPerCurrencyUnit1748400000003 } from '../contexts/loyalty/infrastructure/migrations/1748400000003-AddLoyaltyRedemptionPointsPerCurrencyUnit';
import { NotificationLogEntity } from '../contexts/notification/infrastructure/entities/notification-log.entity';
import { NotificationTemplateEntity } from '../contexts/notification/infrastructure/entities/notification-template.entity';
import { CreateNotificationLogs1748000000010 } from '../contexts/notification/infrastructure/migrations/1748000000010-CreateNotificationLogs';
import { CreateNotificationTemplates1748100000010 } from '../contexts/notification/infrastructure/migrations/1748100000010-CreateNotificationTemplates';
import { AlterNotificationLogs1748200000010 } from '../contexts/notification/infrastructure/migrations/1748200000010-AlterNotificationLogs';
import { CreateNotificationProcessedEvents1748200000020 } from '../contexts/notification/infrastructure/migrations/1748200000020-CreateNotificationProcessedEvents';
import { AddNotificationLogUniqueConstraint1748300000010 } from '../contexts/notification/infrastructure/migrations/1748300000010-AddNotificationLogUniqueConstraint';
import { HotsiteConfigEntity } from '../contexts/platform/infrastructure/entities/hotsite-config.entity';
import { TenantEntity } from '../contexts/platform/infrastructure/entities/tenant.entity';
import { BootstrapSchemas1700000000000 } from '../contexts/platform/infrastructure/migrations/1700000000000-BootstrapSchemas';
import { CreatePlatformTenants1716500000001 } from '../contexts/platform/infrastructure/migrations/1716500000001-CreatePlatformTenants';
import { CreatePlatformHotsiteConfigs1716500000002 } from '../contexts/platform/infrastructure/migrations/1716500000002-CreatePlatformHotsiteConfigs';
import { AddSeoToHotsiteConfigs1748400000001 } from '../contexts/platform/infrastructure/migrations/1748400000001-AddSeoToHotsiteConfigs';
import { StaffEntity } from '../contexts/staff/infrastructure/entities/staff.entity';
import { CreateStaffStaff1716600000002 } from '../contexts/staff/infrastructure/migrations/1716600000002-CreateStaffStaff';
import { AddNameToStaff1716600000003 } from '../contexts/staff/infrastructure/migrations/1716600000003-AddNameToStaff';
import { AddUniqueEmailPerTenant1716600000004 } from '../contexts/staff/infrastructure/migrations/1716600000004-AddUniqueEmailPerTenant';
import { AddInvitedByDeactivatedByToStaff1748000000001 } from '../contexts/staff/infrastructure/migrations/1748000000001-AddInvitedByDeactivatedByToStaff';
import { InboxRecordEntity } from '../shared/infrastructure/inbox/inbox-record.entity';
import { OutboxEventEntity } from '../shared/infrastructure/outbox/outbox-event.entity';
import { AddSharedSchema1748400000005 } from '../shared/infrastructure/migrations/1748400000005-AddSharedSchema';
import { CreateSharedOutbox1748400000006 } from '../shared/infrastructure/migrations/1748400000006-CreateSharedOutbox';
import { CreateSharedInbox1748400000007 } from '../shared/infrastructure/migrations/1748400000007-CreateSharedInbox';

export default async function globalSetup(): Promise<void> {
  const pgContainer = await new PostgreSqlContainer('postgres:15-alpine').start();

  process.env['TEST_DATABASE_URL'] = pgContainer.getConnectionUri();
  process.env['FRONTEND_URL'] = 'http://localhost:3000';
  process.env['JWT_SECRET'] ??= 'integration-test-jwt-secret-64-chars-xxxxxxxxxxxxxxxxxxxxxxxxxxx';

  (globalThis as Record<string, unknown>)['__TC_PG_CONTAINER__'] = pgContainer;

  const ds = new DataSource({
    type: 'postgres',
    url: pgContainer.getConnectionUri(),
    entities: [
      TenantEntity,
      HotsiteConfigEntity,
      ServiceEntity,
      ScheduleClosureEntity,
      ScheduleOpeningEntity,
      BookingEntity,
      BookingLineEntity,
      CustomerEntity,
      StaffEntity,
      NotificationLogEntity,
      NotificationTemplateEntity,
      LoyaltyEntryEntity,
      LoyaltyBalanceEntity,
      LoyaltyRedemptionEntity,
      BalanceExpiryLogEntity,
      InboxRecordEntity,
      OutboxEventEntity,
    ],
    migrations: [
      BootstrapSchemas1700000000000,
      AddSharedSchema1748400000005,
      CreateSharedOutbox1748400000006,
      CreateSharedInbox1748400000007,
      CreatePlatformTenants1716500000001,
      CreatePlatformHotsiteConfigs1716500000002,
      CreateCustomerCustomers1716600000001,
      AddCustomerTenantOAuthUniqueConstraint1748000000002,
      CreateStaffStaff1716600000002,
      AddNameToStaff1716600000003,
      AddUniqueEmailPerTenant1716600000004,
      AddInvitedByDeactivatedByToStaff1748000000001,
      CreateNotificationLogs1748000000010,
      CreateNotificationTemplates1748100000010,
      AlterNotificationLogs1748200000010,
      CreateNotificationProcessedEvents1748200000020,
      AddNotificationLogUniqueConstraint1748300000010,
      CreateBookingServices1748000000011,
      CreateBookingScheduleClosures1748000000012,
      CreateBookingScheduleOpenings1748000000013,
      CreateBookingBookings1748000000014,
      CreateLoyaltyLoyaltyEntries1748000000016,
      CreateLoyaltyBalancesRedemptionsExpiryLog1748000000017,
      AddLoyaltyRedemptionPointsPerCurrencyUnit1748400000003,
      AddSeoToHotsiteConfigs1748400000001,
    ],
    synchronize: false,
    migrationsRun: false,
  });

  // Run docker/init-db.sh inside the container — same script used by docker-compose
  // and production CI. The container already has bash + psql and the POSTGRES_USER /
  // POSTGRES_DB env vars set; the script falls back to safe defaults for passwords.
  const initScript = readFileSync(join(__dirname, '../../../../docker/init-db.sh'), 'utf8');
  const { exitCode, output } = await pgContainer.exec(['bash', '-c', initScript]);
  if (exitCode !== 0) {
    throw new Error(`docker/init-db.sh failed (exit ${exitCode}):\n${output}`);
  }

  await ds.initialize();
  await ds.runMigrations();
  await ds.destroy();

  await startGcsEmulator();
}

// Real fake-gcs-server (same image as docker/docker-compose.yml), for the small set of
// integration specs that need to exercise the actual GcsSignedUrlAdapter — real V4 signed URLs,
// real cross-bucket copy, real delete — instead of the InMemoryStorageService double every other
// integration spec uses. See td/TD22-ORPHANED-UPLOAD-CLEANUP.md.
//
// A fixed port is required (not a Testcontainers-assigned dynamic one): fake-gcs-server's V4
// signed URLs are only valid against the exact `-public-host`/`-external-url` the server was
// started with, which must be known before `withCommand()` — chosen once, before the container's
// dynamic port would otherwise be known. Deliberately different from docker-compose.yml's 4443 so
// a developer's already-running `pnpm infra:up` stack never conflicts with a test run.
const GCS_TEST_PORT = 14443;

async function startGcsEmulator(): Promise<void> {
  const container = await new GenericContainer('fsouza/fake-gcs-server:latest')
    .withCommand([
      '-scheme',
      'http',
      '-port',
      '4443',
      '-backend',
      'memory',
      '-public-host',
      `localhost:${GCS_TEST_PORT}`,
      '-external-url',
      `http://localhost:${GCS_TEST_PORT}`,
    ])
    .withExposedPorts({ container: 4443, host: GCS_TEST_PORT })
    .withWaitStrategy(Wait.forHttp('/_internal/healthcheck', 4443).forStatusCode(200))
    .start();

  (globalThis as Record<string, unknown>)['__TC_GCS_CONTAINER__'] = container;

  const apiEndpoint = `http://localhost:${GCS_TEST_PORT}`;
  process.env['GCS_EMULATOR_HOST'] = apiEndpoint;
  process.env['GCS_BUCKET_NAME'] = 'ikaro-local';
  process.env['GCS_PUBLIC_BUCKET_NAME'] = 'ikaro-local-public';
  process.env['GCS_PUBLIC_BASE_URL'] = apiEndpoint;
  process.env['GCS_KEY_FILE'] = join(__dirname, '../../../../docker/fake-service-account.json');

  // Pre-create both buckets — GcsSignedUrlAdapter.onApplicationBootstrap() only does this when
  // GCS_EMULATOR_HOST is set and the app has actually started; doing it here too means the
  // adapter-level integration spec (which constructs GcsSignedUrlAdapter directly, no Nest app)
  // doesn't depend on bootstrap ordering.
  const storage = new Storage({ apiEndpoint, projectId: 'ikaro-local' });
  for (const bucketName of ['ikaro-local', 'ikaro-local-public']) {
    const [exists] = await storage.bucket(bucketName).exists();
    if (!exists) await storage.createBucket(bucketName);
  }
}
