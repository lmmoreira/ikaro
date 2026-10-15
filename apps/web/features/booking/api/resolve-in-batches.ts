import type {
  ResolveSchedulingExceptionsRequest,
  SchedulingExceptionBulkResultResponse,
  SchedulingExceptionResultItem,
} from '@ikaro/types';
import { resolveSchedulingExceptions } from '@/features/booking/api/scheduling-exceptions';

// MAX_SCHEDULING_EXCEPTION_BATCH in @ikaro/validation: the resolve endpoint refuses more ids than
// this in one request, and "Selecionar todos" on a larger group must not be a 400.
export const RESOLVE_BATCH_SIZE = 100;

export interface BatchedResolveResult {
  readonly results: readonly SchedulingExceptionResultItem[];
  // Ids that were never sent because a later batch failed as a whole request. They stay open.
  readonly notProcessed: readonly string[];
}

type SendBatch = (
  body: ResolveSchedulingExceptionsRequest,
) => Promise<SchedulingExceptionBulkResultResponse>;

function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

// Sends the selected ids in sequential batches of RESOLVE_BATCH_SIZE and merges the per-entry
// results in order. If the very first batch fails as a whole request, nothing changed and the
// error is rethrown; if a later one fails, the earlier batches' results are kept and the ids not
// yet sent are reported as not processed (the earlier batches already took effect).
export async function resolveInBatches(
  request: ResolveSchedulingExceptionsRequest,
  send: SendBatch = resolveSchedulingExceptions,
): Promise<BatchedResolveResult> {
  const batches = chunk(request.exceptionIds, RESOLVE_BATCH_SIZE);
  const results: SchedulingExceptionResultItem[] = [];

  for (const [index, ids] of batches.entries()) {
    try {
      const response = await send({ ...request, exceptionIds: ids });
      results.push(...response.results);
    } catch (err) {
      if (index === 0) throw err;
      return { results, notProcessed: batches.slice(index).flat() };
    }
  }

  return { results, notProcessed: [] };
}
