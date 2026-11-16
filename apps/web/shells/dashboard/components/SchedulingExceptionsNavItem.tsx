'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { AlertTriangle } from 'lucide-react';
import { useOpenSchedulingExceptionsCount } from '@/features/booking/hooks/useSchedulingExceptions';
import { cn } from '@/shared/utils/cn';
import { NavLockMark } from './NavLockMark';

const HREF = '/dashboard/scheduling-exceptions';

// Both items below render for the MANAGER role only, so a STAFF user never mounts the count
// query. The open count shows only above zero.
function useBadge(): number {
  const { data } = useOpenSchedulingExceptionsCount();
  return data ?? 0;
}

// Sidebar entry: right below "Agenda", with the open-entries badge. While BOOKING is locked the
// count read would only be denied, so a locked entry is a plain padlocked link and mounts no query.
export function SchedulingExceptionsSidebarItem({
  locked = false,
}: {
  readonly locked?: boolean;
}): React.JSX.Element {
  return locked ? <SidebarLink locked count={0} /> : <LiveSidebarItem />;
}

function LiveSidebarItem(): React.JSX.Element {
  const count = useBadge();
  return <SidebarLink locked={false} count={count} />;
}

function SidebarLink({
  locked,
  count,
}: {
  readonly locked: boolean;
  readonly count: number;
}): React.JSX.Element {
  const t = useTranslations('dashboard');
  const pathname = usePathname();
  const active = pathname.startsWith(HREF);

  return (
    <Link
      href={HREF}
      data-testid="sidebar-nav-scheduling-exceptions"
      data-locked={locked ? 'true' : undefined}
      className={cn(
        'flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium transition-colors',
        active
          ? 'bg-blue-600 text-white'
          : 'text-white/60 hover:bg-white/[0.07] hover:text-white/90',
        locked && 'opacity-60',
      )}
    >
      <AlertTriangle className="h-4 w-4 shrink-0" />
      {t('nav.schedulingExceptions')}
      {locked ? <NavLockMark className="ml-auto" /> : null}
      {count > 0 ? (
        <span
          data-testid="scheduling-exceptions-badge"
          className={cn(
            'ml-auto rounded-full px-1.5 text-[0.6875rem] font-bold',
            active ? 'bg-white text-blue-600' : 'bg-red-600 text-white',
          )}
        >
          {count}
        </span>
      ) : null}
    </Link>
  );
}

// "Mais" sheet entry (mobile): the bottom nav is full, so the item lives here, first in the
// manager section.
export function SchedulingExceptionsSheetItem({
  onClose,
  locked = false,
}: {
  readonly onClose: () => void;
  readonly locked?: boolean;
}): React.JSX.Element {
  return locked ? (
    <SheetLink onClose={onClose} locked count={0} />
  ) : (
    <LiveSheetItem onClose={onClose} />
  );
}

function LiveSheetItem({ onClose }: { readonly onClose: () => void }): React.JSX.Element {
  const count = useBadge();
  return <SheetLink onClose={onClose} locked={false} count={count} />;
}

function SheetLink({
  onClose,
  locked,
  count,
}: {
  readonly onClose: () => void;
  readonly locked: boolean;
  readonly count: number;
}): React.JSX.Element {
  const t = useTranslations('dashboard');

  return (
    <Link
      href={HREF}
      onClick={onClose}
      data-testid="more-sheet-scheduling-exceptions"
      data-locked={locked ? 'true' : undefined}
      className={cn(
        'flex items-center gap-[0.875rem] px-5 py-[0.875rem] text-[0.9375rem] font-medium text-gray-900 transition-colors active:bg-blue-50',
        locked && 'opacity-60',
      )}
    >
      <AlertTriangle className="h-5 w-5 shrink-0 opacity-60" />
      {t('nav.schedulingExceptions')}
      {locked ? <NavLockMark className="ml-auto" /> : null}
      {count > 0 ? (
        <span
          data-testid="scheduling-exceptions-badge"
          className="ml-auto rounded-full bg-red-600 px-1.5 text-[0.6875rem] font-bold text-white"
        >
          {count}
        </span>
      ) : null}
    </Link>
  );
}
