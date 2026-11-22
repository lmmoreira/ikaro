import { mapSequentially } from './sequential';
import type { IsolatedRunOptions } from './sequential-isolated';

type Outcome<T, R> = { ok: true; value: R } | { ok: false; item: T };

// `mapSequentiallyIsolated` with bounded concurrency: the items are worked through in chunks of
// `concurrency`, the items of one chunk at the same time and the chunks one after another, so at
// most `concurrency` units are in flight. For a cron whose units spend their time waiting on a
// remote service (one provider read per charge) and whose database work is a short transaction of
// its own: it must not be used for units that hold a transaction open across the wait, because
// every one of them holds a pooled connection. Every item is tried, each failure goes through
// `onFailure`, and when any failed the run throws once at the end (never swallowed), so a cron's
// trigger message is nacked and redelivered. Results come back in input order.
export async function mapConcurrentlyIsolated<T, R>(
  items: readonly T[],
  concurrency: number,
  work: (item: T, index: number) => Promise<R>,
  options: IsolatedRunOptions<T>,
): Promise<R[]> {
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new RangeError(`concurrency must be a positive integer, got ${concurrency}`);
  }
  const chunks: { item: T; index: number }[][] = [];
  for (let start = 0; start < items.length; start += concurrency) {
    chunks.push(
      items
        .slice(start, start + concurrency)
        .map((item, offset) => ({ item, index: start + offset })),
    );
  }
  const attempt = async ({ item, index }: { item: T; index: number }): Promise<Outcome<T, R>> => {
    try {
      return { ok: true, value: await work(item, index) };
    } catch (error) {
      options.onFailure(item, error);
      return { ok: false, item };
    }
  };
  const chunked = await mapSequentially(chunks, (chunk) => Promise.all(chunk.map(attempt)));
  const outcomes = chunked.flat();
  const failed = outcomes.flatMap((outcome) => (outcome.ok ? [] : [outcome.item]));
  if (failed.length > 0) throw new Error(options.summarize(failed));
  return outcomes.flatMap((outcome) => (outcome.ok ? [outcome.value] : []));
}
