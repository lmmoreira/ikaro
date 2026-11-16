export const EXPIRY_SWEEP_STATE_REPOSITORY = Symbol('EXPIRY_SWEEP_STATE_REPOSITORY');

// The expiry sweep's watermark: every entry due up to this instant is already in the expiry log.
// System-wide (the sweep spans every tenant), so nothing here is tenant-scoped.
export interface IExpirySweepStateRepository {
  // Null before the first successful run, or after the row was deleted to force a full rescan.
  getProcessedThrough(): Promise<Date | null>;
  // Moves the watermark forward and never backwards, so an overlapping run that finished earlier
  // cannot undo a later one.
  advanceTo(processedThrough: Date): Promise<void>;
}
