/** One earlier `SELF_SIGNUP` registration of a Google `sub`, with whether its tenant ever paid. */
export interface GoogleSubHistoryEntry {
  readonly status: 'RESERVED' | 'COMPLETED';
  /** The tenant's `subscriptions.has_ever_paid`; false when the row has no subscription (yet). */
  readonly hasEverPaid: boolean;
}

export interface TrialEligibilityInput {
  readonly history: readonly GoogleSubHistoryEntry[];
  /** The normalised tax id already belongs to a never-paid account or an in-flight registration. */
  readonly taxIdHeldByUnpaid: boolean;
}

/**
 * The Google half of the one-trial rule (UC-127 A3): the history is eligible only when it is
 * empty or **entirely paid**. A row is paid only when it is `COMPLETED` and its tenant paid, so an
 * unpaid tenant, a `COMPLETED` row with no subscription yet, a mixed history and an in-flight
 * `RESERVED` row (what makes one of two concurrent signups lose under B-A1) are all ineligible.
 */
export function isGoogleSubEligible(history: readonly GoogleSubHistoryEntry[]): boolean {
  return history.every((entry) => entry.status === 'COMPLETED' && entry.hasEverPaid);
}

/** The full rule: the Google half and the tax-id half (UC-127 A3). */
export function evaluateTrialEligibility(input: TrialEligibilityInput): boolean {
  return isGoogleSubEligible(input.history) && !input.taxIdHeldByUnpaid;
}
