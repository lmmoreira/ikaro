import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useDashboardTopbarStatus } from '@/shells/dashboard/components/topbar-status-context';

const SERVICES_LIST_HREF = '/dashboard/services';

interface ServiceEditLeaveGuard {
  readonly discardConfirmOpen: boolean;
  readonly closeDiscardConfirm: () => void;
  readonly handleCancelClick: (event: React.MouseEvent<HTMLAnchorElement>) => void;
  readonly handleConfirmDiscard: () => void;
}

// Unsaved-changes guard for ServiceEditPage, scoped to what this codebase can actually intercept
// today: the Topbar's own back button (onBackOverride — no other existing precedent to build on)
// and the page's own "Cancelar" link. Sidebar/BottomNav navigation is NOT guarded — no existing
// mechanism intercepts shell-level navigation for one page's dirty state, and extending it there
// was decided out of scope at /story-discovery, 2026-09-18. Both guarded exits open the shared
// DiscardChangesDialog (same in-app dialog as the HotSite module config) instead of a native
// window.confirm(); `beforeunload` still covers reload/tab-close, which browsers only let a
// native prompt handle.
export function useServiceEditLeaveGuard(anyDirty: boolean): ServiceEditLeaveGuard {
  const router = useRouter();
  const setOnBackOverride = useDashboardTopbarStatus()?.setOnBackOverride;
  const [discardConfirmOpen, setDiscardConfirmOpen] = useState(false);

  useEffect(() => {
    // useState setters treat a bare function argument as an updater — wrap in an outer arrow so
    // React stores the inner function as the literal state value (matches the existing
    // useHotsiteEditorTopbarOverride.ts precedent). Without the outer wrapper, React invokes this
    // function immediately as `(prevState) => newState` on every effect run, firing the
    // router.push() as an unintended side effect of the state update itself instead of only on a
    // real back-button click.
    setOnBackOverride?.(() => () => {
      if (anyDirty) {
        setDiscardConfirmOpen(true);
        return;
      }
      router.push(SERVICES_LIST_HREF);
    });
    return () => setOnBackOverride?.(null);
  }, [anyDirty, router, setOnBackOverride]);

  useEffect(() => {
    function handleBeforeUnload(event: BeforeUnloadEvent): void {
      if (!anyDirty) return;
      event.preventDefault();
    }
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [anyDirty]);

  function handleCancelClick(event: React.MouseEvent<HTMLAnchorElement>): void {
    if (anyDirty) {
      event.preventDefault();
      setDiscardConfirmOpen(true);
    }
  }

  function handleConfirmDiscard(): void {
    setDiscardConfirmOpen(false);
    router.push(SERVICES_LIST_HREF);
  }

  return {
    discardConfirmOpen,
    closeDiscardConfirm: () => setDiscardConfirmOpen(false),
    handleCancelClick,
    handleConfirmDiscard,
  };
}
