import { Injectable } from '@nestjs/common';
import { getActiveEntityManager } from '../../../../shared/infrastructure/transaction-context';
import { ISignupRegistrationLockPort } from '../../application/ports/signup-registration-lock.port';

@Injectable()
export class TypeOrmSignupRegistrationLockAdapter implements ISignupRegistrationLockPort {
  // Brand-new key (M25-S09), free to namespace: no prior deployed version to desynchronize a
  // rolling deploy against. Once it has protected production traffic its format cannot change.
  async lockSignupRegistration(googleSub: string): Promise<void> {
    const manager = getActiveEntityManager();
    if (!manager) {
      throw new Error('Signup registration lock requires an active transaction');
    }

    await manager.query(
      `SELECT pg_advisory_xact_lock(
         hashtextextended($1::text, 0::bigint)
       )`,
      [`signup:${googleSub}`],
    );
  }
}
