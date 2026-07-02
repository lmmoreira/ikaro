'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Users, Settings, Globe, LogOut } from 'lucide-react';
import { cn } from '@/shared/utils/cn';

interface ManagerSheetProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly tenantSlug: string;
}

const SHEET_ITEM_KEYS = [
  { href: '/dashboard/team', labelKey: 'nav.team', Icon: Users },
  { href: '/dashboard/settings', labelKey: 'nav.settings', Icon: Settings },
  { href: '/dashboard/hotsite', labelKey: 'nav.hotsite', Icon: Globe },
] as const;

export function ManagerSheet({ open, onClose, tenantSlug }: ManagerSheetProps): React.JSX.Element {
  const t = useTranslations('dashboard');
  const logoutUrl = `${process.env.NEXT_PUBLIC_BFF_URL}/auth/logout?tenantSlug=${tenantSlug}`;

  return (
    <>
      {/* Backdrop */}
      <div
        aria-hidden="true"
        onClick={onClose}
        className={cn(
          'fixed inset-0 z-30 bg-black/35 transition-opacity duration-200',
          open ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
      />

      {/* Sheet panel
          Mobile:  slides up from bottom  (translate-y-full → translate-y-0)
          Desktop: centered modal         (lg: overrides translate-y; opacity+scale animate instead)
          inert removes the panel from tab order and AT tree when closed */}
      <div
        data-testid="manager-sheet-panel"
        inert={open ? undefined : true}
        className={cn(
          'fixed z-40 bg-white transition-[transform,opacity] duration-200',
          // Mobile geometry
          'bottom-0 left-0 right-0 rounded-t-2xl',
          // Desktop geometry override
          'lg:bottom-auto lg:top-1/2 lg:left-1/2 lg:right-auto lg:w-full lg:max-w-[28rem] lg:rounded-lg',
          // Desktop centering transform (always applied at lg+, overrides mobile translate-y)
          'lg:-translate-x-1/2 lg:-translate-y-1/2',
          open
            ? 'translate-y-0 opacity-100 lg:scale-100'
            : 'pointer-events-none translate-y-full opacity-0 lg:scale-95',
        )}
      >
        {/* Drag handle — mobile only */}
        <div className="mx-auto mt-3 h-1 w-10 rounded-full bg-gray-900/15 lg:hidden" />

        {/* Section label */}
        <p className="px-5 pb-1 pt-3 text-[0.6875rem] font-bold uppercase tracking-[0.07em] text-gray-900/40">
          {t('nav.managerOnly')}
        </p>

        {/* Nav items */}
        {SHEET_ITEM_KEYS.map(({ href, labelKey, Icon }) => (
          <Link
            key={href}
            href={href}
            onClick={onClose}
            className="flex items-center gap-[0.875rem] px-5 py-[0.875rem] text-[0.9375rem] font-medium text-gray-900 transition-colors active:bg-blue-50"
          >
            <Icon className="h-5 w-5 shrink-0 opacity-60" />
            {t(labelKey)}
          </Link>
        ))}

        {/* Sair */}
        <div className="mt-1 border-t border-gray-100 px-5 py-3">
          <a
            href={logoutUrl}
            className="flex items-center gap-[0.875rem] py-2 text-[0.9375rem] font-medium text-red-600"
          >
            <LogOut className="h-5 w-5" />
            {t('sidebar.signOut')}
          </a>
        </div>
      </div>
    </>
  );
}
