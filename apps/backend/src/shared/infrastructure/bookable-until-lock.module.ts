import { Module } from '@nestjs/common';
import { BOOKABLE_UNTIL_LOCK_PORT } from '../ports/bookable-until-lock.port';
import { TypeOrmBookableUntilLockAdapter } from './typeorm-bookable-until-lock.adapter';

// Both Booking (shared mode) and Billing's plan save (exclusive mode, M26-S19) take this lock, so
// it belongs to neither context. A context that needs it imports this module.
@Module({
  providers: [{ provide: BOOKABLE_UNTIL_LOCK_PORT, useClass: TypeOrmBookableUntilLockAdapter }],
  exports: [BOOKABLE_UNTIL_LOCK_PORT],
})
export class BookableUntilLockModule {}
