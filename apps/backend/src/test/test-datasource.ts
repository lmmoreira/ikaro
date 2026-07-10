import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { BookingEntity } from '../contexts/booking/infrastructure/entities/booking.entity';
import { BookingLineEntity } from '../contexts/booking/infrastructure/entities/booking-line.entity';
import { ScheduleClosureEntity } from '../contexts/booking/infrastructure/entities/schedule-closure.entity';
import { ScheduleOpeningEntity } from '../contexts/booking/infrastructure/entities/schedule-opening.entity';
import { ServiceEntity } from '../contexts/booking/infrastructure/entities/service.entity';
import { CustomerEntity } from '../contexts/customer/infrastructure/entities/customer.entity';
import { BalanceExpiryLogEntity } from '../contexts/loyalty/infrastructure/entities/balance-expiry-log.entity';
import { LoyaltyBalanceEntity } from '../contexts/loyalty/infrastructure/entities/loyalty-balance.entity';
import { LoyaltyEntryEntity } from '../contexts/loyalty/infrastructure/entities/loyalty-entry.entity';
import { LoyaltyRedemptionEntity } from '../contexts/loyalty/infrastructure/entities/loyalty-redemption.entity';
import { ProcessedEventEntity } from '../contexts/loyalty/infrastructure/entities/processed-event.entity';
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
      ScheduleClosureEntity,
      ScheduleOpeningEntity,
      BookingEntity,
      BookingLineEntity,
      CustomerEntity,
      StaffEntity,
      NotificationLogEntity,
      LoyaltyEntryEntity,
      LoyaltyBalanceEntity,
      LoyaltyRedemptionEntity,
      BalanceExpiryLogEntity,
      ProcessedEventEntity,
    ],
    synchronize: false,
    migrationsRun: false,
  });

  await ds.initialize();
  return ds;
}
