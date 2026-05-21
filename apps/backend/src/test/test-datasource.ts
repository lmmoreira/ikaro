import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { ServiceEntity } from '../contexts/booking/infrastructure/entities/service.entity';
import { CustomerEntity } from '../contexts/customer/infrastructure/entities/customer.entity';
import { NotificationLogEntity } from '../contexts/notification/infrastructure/entities/notification-log.entity';
import { HotsiteConfigEntity } from '../contexts/platform/infrastructure/entities/hotsite-config.entity';
import { TenantEntity } from '../contexts/platform/infrastructure/entities/tenant.entity';
import { StaffEntity } from '../contexts/staff/infrastructure/entities/staff.entity';

/**
 * Creates a DataSource for the current test file using the PostgreSQL container
 * started by jest globalSetup. Each integration spec should call this in beforeAll
 * and destroy the result in afterAll to avoid open-handle warnings.
 */
export async function createTestDataSource(): Promise<DataSource> {
  const url = process.env['TEST_DATABASE_URL'];
  if (!url) {
    throw new Error(
      'TEST_DATABASE_URL is not set. Run integration tests via: jest --selectProjects integration',
    );
  }

  const ds = new DataSource({
    type: 'postgres',
    url,
    entities: [
      TenantEntity,
      HotsiteConfigEntity,
      ServiceEntity,
      CustomerEntity,
      StaffEntity,
      NotificationLogEntity,
    ],
    synchronize: false,
    migrationsRun: false,
  });

  await ds.initialize();
  return ds;
}
