'use client';

import { useState, useEffect } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { usePathname } from 'next/navigation';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { formatTodayLabel } from '@/lib/utils/format-today';

interface TopbarProps {
  readonly tenantName: string;
  readonly userName: string | null;
}

const PAGE_TITLE_KEYS: ReadonlyArray<[string, string]> = [
  ['/dashboard/bookings', 'nav.bookings'],
  ['/dashboard/schedule', 'nav.schedule'],
  ['/dashboard/services', 'nav.services'],
  ['/dashboard/loyalty', 'nav.loyalty'],
  ['/dashboard/team', 'nav.team'],
  ['/dashboard/settings', 'nav.settings'],
  ['/dashboard/hotsite', 'nav.hotsite'],
];

function getInitials(name: string | null): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? '?';
  const last = parts.length > 1 ? (parts.at(-1)?.[0] ?? '') : '';
  return `${first}${last}`.toUpperCase();
}

export function Topbar({ tenantName, userName }: TopbarProps): React.JSX.Element {
  const t = useTranslations('dashboard');
  const locale = useLocale();
  const pathname = usePathname();
  const initials = getInitials(userName);
  const [todayLabel, setTodayLabel] = useState('');

  // Computed client-side only to avoid SSR/hydration mismatch when the
  // server timezone differs from the client or the render crosses midnight.
  useEffect(() => {
    setTodayLabel(formatTodayLabel(locale, t('topbar.todayPrefix')));
  }, [locale, t]);

  const pageTitleKey = PAGE_TITLE_KEYS.find(([path]) => pathname.startsWith(path))?.[1];
  const pageTitle = pageTitleKey ? t(pageTitleKey) : t('topbar.defaultTitle');

  return (
    <header className="sticky top-0 z-10 flex items-center gap-3 border-b bg-white px-4 py-3 lg:px-6">
      {/* Mobile: logo mark + tenant name */}
      <div className="flex items-center gap-2.5 lg:hidden">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-blue-600 text-[0.8125rem] font-bold text-white">
          {tenantName[0]?.toUpperCase() ?? 'I'}
        </div>
        <span className="truncate text-[0.9375rem] font-bold text-gray-900">{tenantName}</span>
      </div>

      {/* Desktop: page title */}
      <h1 className="hidden text-[1.0625rem] font-bold text-gray-900 lg:block">{pageTitle}</h1>

      <div className="ml-auto flex items-center gap-3">
        {/* Desktop: today's date — empty until effect runs, preventing SSR mismatch */}
        <span className="hidden text-[0.8125rem] text-gray-900/50 lg:inline">{todayLabel}</span>

        {/* Mobile: user avatar (initials) */}
        <Avatar className="h-8 w-8 lg:hidden">
          <AvatarFallback className="bg-blue-600 text-xs font-bold text-white">
            {initials}
          </AvatarFallback>
        </Avatar>
      </div>
    </header>
  );
}
