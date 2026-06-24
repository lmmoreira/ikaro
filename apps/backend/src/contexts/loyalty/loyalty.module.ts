import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TransactionManagerModule } from '../../shared/infrastructure/transaction-manager.module';
import { RequestModule } from '../../shared/request/request.module';
import { BookingModule } from '../booking/booking.module';
import { PlatformModule } from '../platform/platform.module';
import { BALANCE_EXPIRY_LOG_REPOSITORY } from './application/ports/balance-expiry-log-repository.port';
import { LOYALTY_BALANCE_REPOSITORY } from './application/ports/loyalty-balance-repository.port';
import { LOYALTY_ENTRY_REPOSITORY } from './application/ports/loyalty-entry-repository.port';
import { LOYALTY_REDEMPTION_REPOSITORY } from './application/ports/loyalty-redemption-repository.port';
import { LOYALTY_PLATFORM_PORT } from './application/ports/loyalty-platform.port';
import { LOYALTY_BOOKING_PORT } from './application/ports/loyalty-booking.port';
import { PROCESSED_EVENT_REPOSITORY } from './application/ports/processed-event-repository.port';
import { GetLoyaltyBalanceUseCase } from './application/use-cases/get-loyalty-balance/get-loyalty-balance.use-case';
import { GetLoyaltyEntriesUseCase } from './application/use-cases/get-loyalty-entries/get-loyalty-entries.use-case';
import { GetLoyaltyRedemptionsUseCase } from './application/use-cases/get-loyalty-redemptions/get-loyalty-redemptions.use-case';
import { RedeemPointsUseCase } from './application/use-cases/redeem-points/redeem-points.use-case';
import { CompleteBookingLoyaltyEffectsUseCase } from './application/use-cases/complete-booking-loyalty-effects/complete-booking-loyalty-effects.use-case';
import { ExpirePointsUseCase } from './application/use-cases/expire-points/expire-points.use-case';
import { NotifyExpiringPointsUseCase } from './application/use-cases/notify-expiring-points/notify-expiring-points.use-case';
import { BalanceExpiryLogEntity } from './infrastructure/entities/balance-expiry-log.entity';
import { LoyaltyBalanceEntity } from './infrastructure/entities/loyalty-balance.entity';
import { LoyaltyEntryEntity } from './infrastructure/entities/loyalty-entry.entity';
import { LoyaltyRedemptionEntity } from './infrastructure/entities/loyalty-redemption.entity';
import { ProcessedEventEntity } from './infrastructure/entities/processed-event.entity';
import { LoyaltyPlatformAdapter } from './infrastructure/cross-context/loyalty-platform.adapter';
import { LoyaltyBookingAdapter } from './infrastructure/cross-context/loyalty-booking.adapter';
import { LoyaltyController } from './infrastructure/controllers/loyalty.controller';
import { CronLoyaltyController } from './infrastructure/controllers/cron-loyalty.controller';
import { CustomerRoleGuard } from '../../shared/guards/customer-role.guard';
import { BookingCompletedHandler } from './infrastructure/events/booking-completed.handler';
import { TypeOrmBalanceExpiryLogRepository } from './infrastructure/repositories/typeorm-balance-expiry-log.repository';
import { TypeOrmLoyaltyBalanceRepository } from './infrastructure/repositories/typeorm-loyalty-balance.repository';
import { TypeOrmLoyaltyEntryRepository } from './infrastructure/repositories/typeorm-loyalty-entry.repository';
import { TypeOrmLoyaltyRedemptionRepository } from './infrastructure/repositories/typeorm-loyalty-redemption.repository';
import { TypeOrmProcessedEventRepository } from './infrastructure/repositories/typeorm-processed-event.repository';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      LoyaltyEntryEntity,
      LoyaltyBalanceEntity,
      LoyaltyRedemptionEntity,
      BalanceExpiryLogEntity,
      ProcessedEventEntity,
    ]),
    TransactionManagerModule,
    RequestModule,
    BookingModule,
    PlatformModule,
  ],
  controllers: [LoyaltyController, CronLoyaltyController],
  providers: [
    { provide: LOYALTY_ENTRY_REPOSITORY, useClass: TypeOrmLoyaltyEntryRepository },
    { provide: LOYALTY_BALANCE_REPOSITORY, useClass: TypeOrmLoyaltyBalanceRepository },
    { provide: LOYALTY_REDEMPTION_REPOSITORY, useClass: TypeOrmLoyaltyRedemptionRepository },
    { provide: BALANCE_EXPIRY_LOG_REPOSITORY, useClass: TypeOrmBalanceExpiryLogRepository },
    { provide: PROCESSED_EVENT_REPOSITORY, useClass: TypeOrmProcessedEventRepository },
    { provide: LOYALTY_PLATFORM_PORT, useClass: LoyaltyPlatformAdapter },
    { provide: LOYALTY_BOOKING_PORT, useClass: LoyaltyBookingAdapter },
    CustomerRoleGuard,
    GetLoyaltyBalanceUseCase,
    GetLoyaltyEntriesUseCase,
    GetLoyaltyRedemptionsUseCase,
    RedeemPointsUseCase,
    ExpirePointsUseCase,
    NotifyExpiringPointsUseCase,
    CompleteBookingLoyaltyEffectsUseCase,
    BookingCompletedHandler,
  ],
  exports: [
    LOYALTY_ENTRY_REPOSITORY,
    LOYALTY_BALANCE_REPOSITORY,
    LOYALTY_REDEMPTION_REPOSITORY,
    BALANCE_EXPIRY_LOG_REPOSITORY,
  ],
})
export class LoyaltyModule {}
