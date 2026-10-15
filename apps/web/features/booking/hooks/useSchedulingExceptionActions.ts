import { useState } from 'react';
import { useTranslations } from 'next-intl';
import type {
  ResolveSchedulingExceptionsRequest,
  SchedulingExceptionItem,
  SchedulingExceptionReassignTarget,
  SchedulingExceptionResultItem,
} from '@ikaro/types';
import { useResolveSchedulingExceptions } from '@/features/booking/hooks/useSchedulingExceptions';
import { ApiError } from '@/shared/lib/api/errors';
import { resolveErrorMessageFromApiError } from '@/shared/lib/i18n/resolve-error-message';
import { useResolvedLocale } from '@/shared/lib/i18n/use-resolved-locale';

export interface SchedulingExceptionSheet {
  readonly kind: 'reassign' | 'cancel';
  readonly ids: readonly string[];
  // A new value per opening, so a sheet never keeps the previous opening's choice.
  readonly nonce: number;
}

export interface SchedulingExceptionResultView {
  readonly results: readonly SchedulingExceptionResultItem[];
  // Ids never sent because a later batch failed as a whole request — they stay open.
  readonly notProcessed: readonly string[];
  // The entries as they were when the action was sent (the list refreshes underneath).
  readonly itemsById: ReadonlyMap<string, SchedulingExceptionItem>;
}

interface Options {
  // The live open list by id.
  readonly itemsById: ReadonlyMap<string, SchedulingExceptionItem>;
  // Called after a resolve went through (some or all entries may still be open).
  readonly onResolved: () => void;
}

function reassignRequest(
  ids: readonly string[],
  input: { target: SchedulingExceptionReassignTarget; reason?: string },
): ResolveSchedulingExceptionsRequest {
  return {
    exceptionIds: [...ids],
    resolutionType: 'REASSIGN',
    target: input.target,
    ...(input.reason ? { reason: input.reason } : {}),
  };
}

function cancelRequest(
  ids: readonly string[],
  input: { reason?: string },
): ResolveSchedulingExceptionsRequest {
  return {
    exceptionIds: [...ids],
    resolutionType: 'CANCEL',
    ...(input.reason ? { reason: input.reason } : {}),
  };
}

// The resolve call and the result screen that replaces the list afterwards.
function useResolveOutcome({ itemsById, onResolved }: Options) {
  const t = useTranslations('dashboard.schedulingExceptionsPage');
  const locale = useResolvedLocale();
  const mutation = useResolveSchedulingExceptions();
  const [resultView, setResultView] = useState<SchedulingExceptionResultView | null>(null);

  // The entries behind some ids: the live list first, the result snapshot as the fallback (a
  // still-open entry in the result screen is acted on from there).
  function entriesFor(ids: readonly string[]): SchedulingExceptionItem[] {
    return ids
      .map((id) => itemsById.get(id) ?? resultView?.itemsById.get(id))
      .filter((i): i is SchedulingExceptionItem => Boolean(i));
  }

  // Resolves to the inline error message when the very first request failed as a whole (nothing
  // changed, the selection is kept), or null once the result screen is showing.
  async function run(
    request: ResolveSchedulingExceptionsRequest,
    ids: readonly string[],
  ): Promise<string | null> {
    const snapshot = new Map(entriesFor(ids).map((i) => [i.id, i]));
    try {
      const outcome = await mutation.mutateAsync(request);
      setResultView({ ...outcome, itemsById: snapshot });
      onResolved();
      return null;
    } catch (err) {
      return err instanceof ApiError
        ? resolveErrorMessageFromApiError(err, locale)
        : t('submitErrorBody');
    }
  }

  return {
    resultView,
    isSubmitting: mutation.isPending,
    entriesFor,
    run,
    clearResult: () => setResultView(null),
  };
}

// The worklist's action state: which sheet is open, its inline error, and the submit handlers.
export function useSchedulingExceptionActions(options: Options) {
  const outcome = useResolveOutcome(options);
  const [sheet, setSheet] = useState<SchedulingExceptionSheet | null>(null);
  const [sheetError, setSheetError] = useState<string | null>(null);

  function openSheet(kind: SchedulingExceptionSheet['kind'], ids: readonly string[]): void {
    setSheetError(null);
    setSheet({ kind, ids, nonce: Date.now() });
  }

  async function send(request: ResolveSchedulingExceptionsRequest): Promise<void> {
    setSheetError(null);
    const error = await outcome.run(request, request.exceptionIds);
    if (error) setSheetError(error);
    else setSheet(null);
  }

  return {
    sheet,
    sheetError,
    resultView: outcome.resultView,
    isSubmitting: outcome.isSubmitting,
    entriesFor: outcome.entriesFor,
    openSheet,
    closeSheet: () => setSheet(null),
    clearResult: outcome.clearResult,
    submitReassign: async (input: {
      target: SchedulingExceptionReassignTarget;
      reason?: string;
    }) => {
      if (sheet) await send(reassignRequest(sheet.ids, input));
    },
    submitCancel: async (input: { reason?: string }) => {
      if (sheet) await send(cancelRequest(sheet.ids, input));
    },
  };
}
