export const BOOKABLE_UNTIL_LOCK_PORT = Symbol('BookableUntilLockPort');

/**
 * The per-tenant lock that orders a plan save which removes the BOOKING feature against every
 * Booking path that creates or moves a commitment (docs/LOCK_CATALOG.md B-U1, M26-S18b).
 *
 * One advisory key per tenant, taken in two modes. A Booking path takes it **shared**, so bookings
 * never wait for each other; the plan save takes it **exclusive**, so it waits for the bookings in
 * flight (and counts them) and every booking that arrives after it waits for its commit (and reads
 * the cap). Both calls must run inside an active `ITransactionManager.run()` block and throw
 * outside one; the lock is released on commit or rollback.
 */
export interface BookableUntilLockPort {
  /** Booking side: held together with other shared holders, blocked only by the exclusive one. */
  lockCommitmentsShared(tenantId: string): Promise<void>;

  /** Plan-save side (M26-S19): waits for every shared holder, blocks every new one until commit. */
  lockCommitmentsExclusive(tenantId: string): Promise<void>;
}
