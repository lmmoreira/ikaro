import { useState } from 'react';
import type {
  ResolveSchedulingExceptionsRequest,
  SchedulingExceptionReassignTarget,
  StaffBookingDetailResponse,
} from '@ikaro/types';
import { getBooking } from '@/features/booking/api/booking';
import { useBookingOpenExceptions } from '@/features/booking/hooks/useBookingOpenExceptions';
import {
  cancelRequest,
  reassignRequest,
} from '@/features/booking/hooks/useSchedulingExceptionActions';
import { useResolveSchedulingExceptions } from '@/features/booking/hooks/useSchedulingExceptions';
import {
  resolveErrorMessage,
  resolveErrorMessageFromApiError,
} from '@/shared/lib/i18n/resolve-error-message';
import { useResolvedLocale } from '@/shared/lib/i18n/use-resolved-locale';

// The entry was closed by someone else (or by a reactivation) between loading the page and the click.
const ALREADY_RESOLVED = 'BOOKING_EXCEPTION_ALREADY_RESOLVED';

export interface DecisionSheet {
  readonly kind: 'reassign' | 'cancel';
  readonly ids: readonly string[];
  // A new value per opening, so a sheet never keeps the previous opening's choice.
  readonly nonce: number;
}

interface Options {
  readonly bookingId: string;
  // The booking as the server has it after a resolve; the page replaces its own copy with it.
  readonly onBookingRefreshed: (fresh: StaffBookingDetailResponse) => void;
}

// Which sheet is open and its inline error.
function useDecisionSheet() {
  const [sheet, setSheet] = useState<DecisionSheet | null>(null);
  const [sheetError, setSheetError] = useState<string | null>(null);
  return {
    sheet,
    sheetError,
    setSheetError,
    openSheet: (kind: DecisionSheet['kind'], ids: readonly string[]) => {
      setSheetError(null);
      setSheet({ kind, ids, nonce: Date.now() });
    },
    closeSheet: () => setSheet(null),
  };
}

// The page copies the server page's booking into state, so a query invalidation alone never reaches
// it, and a client-side guess at the new status would drift from the server's own rules: after a
// resolve the booking is refetched and handed back.
function useBookingRefresh({ bookingId, onBookingRefreshed }: Options) {
  const [refreshFailed, setRefreshFailed] = useState(false);
  async function refreshBooking(): Promise<void> {
    try {
      onBookingRefreshed(await getBooking(bookingId));
      setRefreshFailed(false);
    } catch {
      setRefreshFailed(true);
    }
  }
  return { refreshFailed, refreshBooking };
}

// The resolve call and what each outcome does to the sheet and the page.
function useDecisionResolve(
  sheetState: ReturnType<typeof useDecisionSheet>,
  refreshBooking: () => Promise<void>,
) {
  const locale = useResolvedLocale();
  const mutation = useResolveSchedulingExceptions();
  const { sheet, setSheetError, closeSheet } = sheetState;

  async function send(request: ResolveSchedulingExceptionsRequest): Promise<void> {
    setSheetError(null);
    try {
      const outcome = await mutation.mutateAsync(request);
      const stillOpen = outcome.results.find((r) => r.outcome === 'STILL_OPEN');
      const anyResolved = outcome.results.some((r) => r.outcome === 'RESOLVED');
      // A cancel sends every entry id of the booking: once the first one cancelled it, the others
      // report "still open" for a booking that no longer exists, which the refetch then shows.
      if (!stillOpen || anyResolved || stillOpen.errorCode === ALREADY_RESOLVED) {
        closeSheet();
        await refreshBooking();
        return;
      }
      setSheetError(resolveErrorMessage(stillOpen.errorCode, locale));
    } catch (err) {
      setSheetError(resolveErrorMessageFromApiError(err, locale));
    }
  }

  return {
    isSubmitting: mutation.isPending,
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

// M23-S46 — the decision panel's state: the booking's open entries, which sheet is open and its
// inline error, and the resolve itself.
export function useBookingDecision(options: Options) {
  const entriesQuery = useBookingOpenExceptions(options.bookingId);
  const sheetState = useDecisionSheet();
  const { refreshFailed, refreshBooking } = useBookingRefresh(options);
  const resolve = useDecisionResolve(sheetState, refreshBooking);

  return {
    entries: entriesQuery.data?.items ?? [],
    isLoading: entriesQuery.isPending && entriesQuery.fetchStatus !== 'idle',
    isError: entriesQuery.isError,
    retryLoad: () => void entriesQuery.refetch(),
    sheet: sheetState.sheet,
    sheetError: sheetState.sheetError,
    openSheet: sheetState.openSheet,
    closeSheet: sheetState.closeSheet,
    refreshFailed,
    ...resolve,
  };
}
