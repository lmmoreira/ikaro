import { ISignupRegistrationRepository } from '../../../contexts/billing/application/ports/signup-registration-repository.port';
import type { SignupRegistration } from '../../../contexts/billing/domain/signup-registration';
import type { GoogleSubHistoryEntry } from '../../../contexts/billing/domain/trial-eligibility';

export class InMemorySignupRegistrationRepository implements ISignupRegistrationRepository {
  readonly saved: SignupRegistration[] = [];
  private readonly history = new Map<string, GoogleSubHistoryEntry[]>();
  private readonly unpaidTaxIds = new Set<string>();

  /** Test seam: an earlier registration of the Google `sub` (what a past signup left behind). */
  seedHistory(googleSub: string, ...entries: GoogleSubHistoryEntry[]): void {
    this.history.set(googleSub, [...(this.history.get(googleSub) ?? []), ...entries]);
  }

  /** Test seam: a never-paid billing account already holds this normalised tax id. */
  seedUnpaidTaxId(taxId: string): void {
    this.unpaidTaxIds.add(taxId);
  }

  async findGoogleSubHistory(googleSub: string): Promise<GoogleSubHistoryEntry[]> {
    return [...(this.history.get(googleSub) ?? [])];
  }

  async isTaxIdHeldByUnpaid(taxId: string): Promise<boolean> {
    return (
      this.unpaidTaxIds.has(taxId) ||
      this.saved.some((row) => row.status === 'RESERVED' && row.taxId?.value === taxId)
    );
  }

  async save(registration: SignupRegistration): Promise<void> {
    this.saved.push(registration);
    if (registration.source === 'SELF_SIGNUP' && registration.googleSub !== null) {
      this.seedHistory(registration.googleSub, { status: 'RESERVED', hasEverPaid: false });
    }
  }
}
