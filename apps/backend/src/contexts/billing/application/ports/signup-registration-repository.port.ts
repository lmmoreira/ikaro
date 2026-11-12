import type { SignupRegistration } from '../../domain/signup-registration';
import type { GoogleSubHistoryEntry } from '../../domain/trial-eligibility';

export const SIGNUP_REGISTRATION_REPOSITORY = Symbol('ISignupRegistrationRepository');

/**
 * Registrations are looked up by Google `sub` or tax id before any tenant exists, so nothing here
 * is tenant-scoped (`docs/TENANT_ISOLATION_STRATEGY.md`, the `signup_registrations` exemption).
 */
export interface ISignupRegistrationRepository {
  /**
   * Every earlier `SELF_SIGNUP` registration of the Google `sub`, each with whether its tenant's
   * subscription ever paid (false when the registration has no tenant or subscription yet).
   */
  findGoogleSubHistory(googleSub: string): Promise<GoogleSubHistoryEntry[]>;

  /**
   * Whether the normalised tax id belongs to a billing account whose subscription never paid, or
   * to an in-flight `RESERVED` registration.
   */
  isTaxIdHeldByUnpaid(taxId: string): Promise<boolean>;

  /** Inserts a new `RESERVED` registration (S09). Completing one is `complete()`. */
  save(registration: SignupRegistration): Promise<void>;

  /** The registration with this id, or `null` when none exists. Takes no lock (see `complete`). */
  findById(id: string): Promise<SignupRegistration | null>;

  /**
   * Persists the `COMPLETED` record `SignupRegistration.complete()` returned (tenant id set, tax id
   * cleared) with one conditional `UPDATE … WHERE id = :id AND status = 'RESERVED'`, so a
   * registration can attach to one tenant only even when two completions race: the loser matches
   * zero rows and gets `SignupRegistrationNotAvailableError`. No row lock is needed (M25-S11).
   * Must run inside the same `ITransactionManager.run()` as the subscription it belongs to.
   */
  complete(registration: SignupRegistration): Promise<void>;
}
