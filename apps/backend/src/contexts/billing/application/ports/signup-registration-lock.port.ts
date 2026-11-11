export const SIGNUP_REGISTRATION_LOCK = Symbol('ISignupRegistrationLockPort');

/**
 * Lock B-A1 (`docs/LOCK_CATALOG.md`): serialises the trial-eligibility check and the `RESERVED`
 * insert of one Google account. No row exists yet to lock, so the primitive is a
 * transaction-scoped advisory lock. It must be called inside an active `ITransactionManager.run()`.
 */
export interface ISignupRegistrationLockPort {
  /** Key `signup:{googleSub}`; two concurrent reservations of one Google account queue here. */
  lockSignupRegistration(googleSub: string): Promise<void>;
}
