// Runs `work` for each item strictly one after another and returns the results in input order.
//
// For async work that must NOT run concurrently: statements issued on one transaction's single
// connection (the driver only queues them anyway), per-item transactions whose row and advisory
// locks would otherwise contend with each other (and, run in parallel, could exhaust the
// connection pool with transactions each waiting for a second connection), and best-effort
// batches whose results must come back in request order. Independent work with no such constraint
// belongs in Promise.all instead.
export function mapSequentially<T, R>(
  items: readonly T[],
  work: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  return items.reduce<Promise<R[]>>(async (previous, item, index) => {
    const results = await previous;
    results.push(await work(item, index));
    return results;
  }, Promise.resolve([]));
}
