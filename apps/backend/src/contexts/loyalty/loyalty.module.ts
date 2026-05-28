import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TransactionManagerModule } from '../../shared/infrastructure/transaction-manager.module';
import { LOYALTY_ENTRY_REPOSITORY } from './application/ports/loyalty-entry-repository.port';
import { LoyaltyEntryEntity } from './infrastructure/entities/loyalty-entry.entity';
import { TypeOrmLoyaltyEntryRepository } from './infrastructure/repositories/typeorm-loyalty-entry.repository';

@Module({
  imports: [TypeOrmModule.forFeature([LoyaltyEntryEntity]), TransactionManagerModule],
  providers: [{ provide: LOYALTY_ENTRY_REPOSITORY, useClass: TypeOrmLoyaltyEntryRepository }],
  exports: [LOYALTY_ENTRY_REPOSITORY],
})
export class LoyaltyModule {}
