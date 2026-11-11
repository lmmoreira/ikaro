import { ISignupRegistrationLockPort } from '../../../contexts/billing/application/ports/signup-registration-lock.port';
import { InMemoryTransactionManager } from '../../infrastructure/in-memory-transaction-manager';

/** Records each lock call and fails, like the real adapter, when no transaction is active. */
export class InMemorySignupRegistrationLock implements ISignupRegistrationLockPort {
  readonly locked: string[] = [];

  constructor(private readonly txManager: InMemoryTransactionManager) {}

  async lockSignupRegistration(googleSub: string): Promise<void> {
    if (!this.txManager.isInTransaction) {
      throw new Error('Signup registration lock requires an active transaction');
    }
    this.locked.push(googleSub);
  }
}
