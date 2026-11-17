'use client';

import { Fragment } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type { FeatureKey } from '@ikaro/types';
import { LogOut } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/shared/components/ui/avatar';
import { isRouteLocked } from '@/shared/lib/billing/feature-registry';
import { getPublicEnv } from '@/shared/lib/runtime-env/public-env';
import { cn } from '@/shared/utils/cn';
import type { DashboardNav } from '@/shells/dashboard/model/dashboard-nav';
import { NavLockMark } from './NavLockMark';
import { SchedulingExceptionsSidebarItem } from './SchedulingExceptionsNavItem';
import { getInitials } from '@/shared/utils/initials';

interface SidebarProps {
  readonly tenantName: string;
  readonly tenantSlug: string;
  readonly userName: string | null;
  readonly role: 'STAFF' | 'MANAGER';
  // What the dashboard shell resolved for this caller (`resolveDashboardNav`): the items to draw,
  // each shown or locked (UC-125).
  readonly nav: DashboardNav;
  // The features the tenant does not hold: the scheduling-exceptions item, which the shell composes
  // itself, renders locked.
  readonly lockedFeatures: readonly FeatureKey[];
}

// A locked item keeps the label colour of any inactive item: dimming the whole link would stack
// on the already muted label and fall below readable contrast. The padlock and the dimmed icon
// carry the locked cue.
function navItemClass(active: boolean): string {
  return cn(
    'flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium transition-colors',
    active ? 'bg-blue-600 text-white' : 'text-white/60 hover:bg-white/[0.07] hover:text-white/90',
  );
}

export function Sidebar({
  tenantName,
  tenantSlug,
  userName,
  role,
  nav,
  lockedFeatures,
}: SidebarProps): React.JSX.Element {
  const t = useTranslations('dashboard');
  const pathname = usePathname();
  const initials = getInitials(userName);
  const logoutUrl = `${getPublicEnv('NEXT_PUBLIC_BFF_URL')}/auth/logout?tenantSlug=${tenantSlug}`;

  return (
    <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col overflow-y-auto bg-sidebar lg:flex">
      {/* Header — logo mark + tenant name + @slug */}
      <div className="flex items-center gap-3 border-b border-white/[0.07] px-4 py-[1.125rem]">
        <div className="flex h-[1.875rem] w-[1.875rem] shrink-0 items-center justify-center rounded-md bg-blue-600 text-[0.8125rem] font-bold text-white">
          {tenantName[0]?.toUpperCase() ?? 'I'}
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-bold leading-tight text-white">{tenantName}</p>
          <p className="mt-0.5 text-[0.6875rem] text-white/40">@{tenantSlug}</p>
        </div>
      </div>

      {/* Main nav */}
      <nav className="mt-2 flex flex-col gap-0.5 px-2">
        {nav.sidebarMain.map(({ href, labelKey, Icon, locked, testId }, index) => {
          return (
            <Fragment key={href}>
              <Link
                href={href}
                data-testid={testId}
                data-locked={locked ? 'true' : undefined}
                className={navItemClass(pathname.startsWith(href))}
              >
                <Icon className={cn('h-4 w-4 shrink-0', locked && 'opacity-60')} />
                {t(labelKey)}
                {locked ? <NavLockMark className="ml-auto" /> : null}
              </Link>
              {/* "Reservas a resolver": MANAGER only, right below "Agenda" (M23-S14) */}
              {index === 0 && role === 'MANAGER' ? (
                <SchedulingExceptionsSidebarItem
                  locked={isRouteLocked('/dashboard/scheduling-exceptions', lockedFeatures)}
                />
              ) : null}
            </Fragment>
          );
        })}
      </nav>

      {/* Manager-only section */}
      {role === 'MANAGER' && (
        <>
          <p className="px-4 pb-1 pt-[0.875rem] text-[0.625rem] font-bold uppercase tracking-[0.09em] text-white/35">
            {t('nav.managerOnly')}
          </p>
          <nav className="flex flex-col gap-0.5 px-2">
            {nav.sidebarManager.map(({ href, labelKey, Icon, locked, testId }) => {
              return (
                <Link
                  key={href}
                  href={href}
                  data-testid={testId}
                  data-locked={locked ? 'true' : undefined}
                  className={navItemClass(pathname.startsWith(href))}
                >
                  <Icon className={cn('h-4 w-4 shrink-0', locked && 'opacity-60')} />
                  {t(labelKey)}
                  {locked ? <NavLockMark className="ml-auto" /> : null}
                </Link>
              );
            })}
          </nav>
        </>
      )}

      {/* Footer — avatar + user name + role badge + logout */}
      <div className="mt-auto flex items-center gap-2.5 border-t border-white/[0.07] px-4 py-[0.875rem]">
        <Avatar className="h-8 w-8 shrink-0">
          <AvatarFallback className="bg-blue-600 text-xs font-bold text-white">
            {initials}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[0.8125rem] font-semibold leading-tight text-white">
            {userName ?? ''}
          </p>
          <span
            className={cn(
              'mt-0.5 inline-block rounded px-1.5 py-0.5 text-[0.625rem] font-bold uppercase tracking-[0.05em]',
              role === 'MANAGER' ? 'bg-blue-600/25 text-blue-300' : 'bg-white/10 text-white/60',
            )}
          >
            {role === 'MANAGER' ? t('sidebar.roleManager') : t('sidebar.roleStaff')}
          </span>
        </div>
        <a
          href={logoutUrl}
          title={t('sidebar.signOut')}
          className="shrink-0 text-white/35 transition-colors hover:text-white/75"
        >
          <LogOut className="h-4 w-4" />
        </a>
      </div>
    </aside>
  );
}
