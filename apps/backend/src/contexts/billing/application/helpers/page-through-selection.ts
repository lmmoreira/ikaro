import { BILLING_JOB_PAGE_SIZE } from '../../domain/billing-constants';

export interface PageThroughSelectionOptions<T> {
  /** Reads one page of the selection, after the given row. */
  fetch: (after?: T) => Promise<T[]>;
  /** Works one page. A throw is reported through `onFailure` and the next page still runs. */
  onPage: (page: readonly T[]) => Promise<void>;
  /** A page that could not be read (`'SELECTION'`) or worked (`'PAGE'`); the run keeps going. */
  onFailure: (error: unknown, stage: 'SELECTION' | 'PAGE') => void;
}

/**
 * Pages a Billing job's selection by keyset until it is exhausted (docs/ENGINEERING_RULES_BACKEND.md
 * § Billing, M26-S05 onwards): each page starts after the last row of the one before, because a row
 * the job skips stays selected and asking for the head again would starve the rows behind it. A
 * page that cannot be read or worked is reported and the rest of the selection still runs, so one
 * bad page never hides the others; the caller decides what to do with the failures (the jobs
 * collect them and rethrow the first once every unit was tried).
 */
export async function pageThroughSelection<T>(
  options: PageThroughSelectionOptions<T>,
  after?: T,
): Promise<void> {
  let page: T[];
  try {
    page = await options.fetch(after);
  } catch (error) {
    options.onFailure(error, 'SELECTION');
    return;
  }
  if (page.length === 0) return;
  try {
    await options.onPage(page);
  } catch (error) {
    options.onFailure(error, 'PAGE');
  }
  const last = page.at(-1);
  if (page.length < BILLING_JOB_PAGE_SIZE || last === undefined) return;
  await pageThroughSelection(options, last);
}
