export interface ExpiryPause {
  pausedAt: Date;
  /** `null` while the pause is open (the tenant is still suspended). */
  resumedAt: Date | null;
}

export interface ExpiringEntry {
  earnedAt: Date;
  expiresAt: Date;
}

/**
 * The instant a loyalty entry really expires once the tenant's suspension pauses are applied, or
 * `null` while an open pause holds it (docs/DOMAIN_MODEL.md § Expiration window).
 *
 * The entry's lifetime (`expiresAt - earnedAt`) is measured in non-suspended time: the clock stops
 * for every pause and restarts when it ends, so a pause that falls inside an earlier pause's
 * extension counts too. A pause that starts at or after the entry's raw expiry never rescues an
 * entry that was already due. `LoyaltyEntry.expiresAt` itself is never rewritten.
 */
export function effectiveExpiry(entry: ExpiringEntry, pauses: readonly ExpiryPause[]): Date | null {
  let remainingMs = entry.expiresAt.getTime() - entry.earnedAt.getTime();
  let cursor = entry.earnedAt.getTime();

  const ordered = [...pauses].sort((a, b) => a.pausedAt.getTime() - b.pausedAt.getTime());
  for (const pause of ordered) {
    const pausedAt = pause.pausedAt.getTime();
    const resumedAt = pause.resumedAt?.getTime() ?? null;
    if (resumedAt !== null && resumedAt <= cursor) continue;

    const activeBeforePause = Math.max(0, pausedAt - cursor);
    if (remainingMs <= activeBeforePause) break;
    // The pause starts before the entry's active time is used up: the clock stops here.
    if (resumedAt === null) return null;
    remainingMs -= activeBeforePause;
    cursor = Math.max(cursor, resumedAt);
  }

  return new Date(cursor + remainingMs);
}
