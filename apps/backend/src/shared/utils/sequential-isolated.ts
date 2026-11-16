import { mapSequentially } from './sequential';

export interface IsolatedRunOptions<T> {
  // Called once per failed item, as the failure happens, so the caller logs it with its own
  // context (a tenant id, a customer id). The helper itself logs nothing.
  readonly onFailure: (item: T, error: unknown) => void;
  // The message of the single error thrown after every item was tried.
  readonly summarize: (failed: readonly T[]) => string;
}

type Outcome<T, R> = { ok: true; value: R } | { ok: false; item: T };

// `mapSequentially` where one item's failure does not stop the items after it. Every item is
// tried, each failure is reported through `onFailure`, and when any failed the run throws once at
// the end (never swallowed), so a cron's trigger message is nacked and redelivered. Use it for a
// cron's independent units of work (a tenant, a customer) whose work is idempotent, so the retry
// only does what is still undone.
export async function mapSequentiallyIsolated<T, R>(
  items: readonly T[],
  work: (item: T, index: number) => Promise<R>,
  options: IsolatedRunOptions<T>,
): Promise<R[]> {
  const outcomes = await mapSequentially(items, async (item, index): Promise<Outcome<T, R>> => {
    try {
      return { ok: true, value: await work(item, index) };
    } catch (error) {
      options.onFailure(item, error);
      return { ok: false, item };
    }
  });
  const failed = outcomes.flatMap((outcome) => (outcome.ok ? [] : [outcome.item]));
  if (failed.length > 0) throw new Error(options.summarize(failed));
  return outcomes.flatMap((outcome) => (outcome.ok ? [outcome.value] : []));
}
