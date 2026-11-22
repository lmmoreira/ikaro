import { ISignupRegistrationRepository } from '../../../contexts/billing/application/ports/signup-registration-repository.port';
import { SignupRegistrationNotAvailableError } from '../../../contexts/billing/domain/errors/billing-domain.error';
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

  async findById(id: string): Promise<SignupRegistration | null> {
    return this.saved.find((row) => row.id === id) ?? null;
  }

  async releaseExpiredReservations(cutoff: Date): Promise<number> {
    const expired = this.saved.filter(
      (row) => row.status === 'RESERVED' && row.createdAt.getTime() < cutoff.getTime(),
    );
    const kept = this.saved.filter((row) => !expired.includes(row));
    this.saved.splice(0, this.saved.length, ...kept);
    // `save()` seeded one RESERVED history entry per self-signup; releasing the row removes it too.
    for (const row of expired) {
      if (row.source !== 'SELF_SIGNUP' || row.googleSub === null) continue;
      const entries = this.history.get(row.googleSub) ?? [];
      const index = entries.findIndex((entry) => entry.status === 'RESERVED');
      if (index !== -1) entries.splice(index, 1);
    }
    return expired.length;
  }

  // Mirrors the adapter's conditional UPDATE: only a stored RESERVED row completes.
  async complete(registration: SignupRegistration): Promise<void> {
    const index = this.saved.findIndex((row) => row.id === registration.id);
    if (index === -1 || this.saved[index].status !== 'RESERVED') {
      throw new SignupRegistrationNotAvailableError(registration.id);
    }
    this.saved[index] = registration;
  }
}
