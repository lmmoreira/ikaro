export const DEV_CLOCK_CONTROL = Symbol('IDevClockControl');

/**
 * Moves the dev clock. Bound only in `local` and `staging` (`DevClockModule.register`); nothing in
 * production can resolve this token. The offset lives in the process, so it is only meaningful on
 * a single instance (`instanceId` reveals a second one).
 */
export interface IDevClockControl {
  readonly offsetMs: number;
  readonly instanceId: string;
  advanceBy(ms: number): void;
  reset(): void;
}
