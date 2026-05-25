import { PostgreSqlContainer } from '@testcontainers/postgresql';
import 'reflect-metadata';
import { GenericContainer, Wait } from 'testcontainers';
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
import { AddBookingVersion1748000000015 } from '../contexts/booking/infrastructure/migrations/1748000000015-AddBookingVersion';
import { CustomerEntity } from '../contexts/customer/infrastructure/entities/customer.entity';
import { CreateCustomerCustomers1716600000001 } from '../contexts/customer/infrastructure/migrations/1716600000001-CreateCustomerCustomers';
import { AddCustomerTenantOAuthUniqueConstraint1748000000002 } from '../contexts/customer/infrastructure/migrations/1748000000002-AddCustomerTenantOAuthUniqueConstraint';
import { NotificationLogEntity } from '../contexts/notification/infrastructure/entities/notification-log.entity';
import { CreateNotificationLogs1748000000010 } from '../contexts/notification/infrastructure/migrations/1748000000010-CreateNotificationLogs';
import { HotsiteConfigEntity } from '../contexts/platform/infrastructure/entities/hotsite-config.entity';
import { TenantEntity } from '../contexts/platform/infrastructure/entities/tenant.entity';
import { CreatePlatformTenants1716500000001 } from '../contexts/platform/infrastructure/migrations/1716500000001-CreatePlatformTenants';
import { CreatePlatformHotsiteConfigs1716500000002 } from '../contexts/platform/infrastructure/migrations/1716500000002-CreatePlatformHotsiteConfigs';
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
    ],
    migrations: [
      CreatePlatformTenants1716500000001,
      CreatePlatformHotsiteConfigs1716500000002,
      CreateCustomerCustomers1716600000001,
      AddCustomerTenantOAuthUniqueConstraint1748000000002,
      CreateStaffStaff1716600000002,
      AddNameToStaff1716600000003,
      AddUniqueEmailPerTenant1716600000004,
      AddInvitedByDeactivatedByToStaff1748000000001,
      CreateNotificationLogs1748000000010,
      CreateBookingServices1748000000011,
      CreateBookingScheduleClosures1748000000012,
      CreateBookingScheduleOpenings1748000000013,
      CreateBookingBookings1748000000014,
      AddBookingVersion1748000000015,
    ],
    synchronize: false,
    migrationsRun: false,
  });

  await ds.initialize();
  await ds.query(`CREATE SCHEMA IF NOT EXISTS "platform"`);
  await ds.runMigrations();
  await ds.destroy();
}
