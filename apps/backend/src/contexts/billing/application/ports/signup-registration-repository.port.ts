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

  /** Inserts the registration (S09 only creates; S11 completes it). */
  save(registration: SignupRegistration): Promise<void>;
}
