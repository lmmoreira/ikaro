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
import { NotificationLogEntity } from '../contexts/notification/infrastructure/entities/notification-log.entity';
import { ChatbotMessageEntity } from '../contexts/platform/infrastructure/entities/chatbot-message.entity';
import { ChatbotProviderBalanceEntity } from '../contexts/platform/infrastructure/entities/chatbot-provider-balance.entity';
import { ChatbotSessionEntity } from '../contexts/platform/infrastructure/entities/chatbot-session.entity';
import { HotsiteConfigEntity } from '../contexts/platform/infrastructure/entities/hotsite-config.entity';
import { LeadFormAnswerEntity } from '../contexts/platform/infrastructure/entities/lead-form-answer.entity';
import { LeadFormConfigEntity } from '../contexts/platform/infrastructure/entities/lead-form-config.entity';
import { LeadFormSubmissionEntity } from '../contexts/platform/infrastructure/entities/lead-form-submission.entity';
import { TenantEntity } from '../contexts/platform/infrastructure/entities/tenant.entity';
import { StaffEntity } from '../contexts/staff/infrastructure/entities/staff.entity';
import { InboxRecordEntity } from '../shared/infrastructure/inbox/inbox-record.entity';
import { OutboxEventEntity } from '../shared/infrastructure/outbox/outbox-event.entity';

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
      LeadFormConfigEntity,
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
      InboxRecordEntity,
      OutboxEventEntity,
      ChatbotSessionEntity,
      ChatbotMessageEntity,
      ChatbotProviderBalanceEntity,
      LeadFormSubmissionEntity,
      LeadFormAnswerEntity,
    ],
    synchronize: false,
    migrationsRun: false,
  });

  await ds.initialize();
  return ds;
}
