'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Home, Calendar, Star, ChevronDown } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';

interface CustomerShellProps {
  readonly children: React.ReactNode;
  readonly tenantName: string;
  readonly tenantSlug: string;
  readonly userName: string | null;
}

function getInitials(name: string | null): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? '?';
  const last = parts.length > 1 ? (parts.at(-1)?.[0] ?? '') : '';
  return `${first}${last}`.toUpperCase();
}

export function CustomerShell({
  children,
  tenantName,
  tenantSlug,
  userName,
}: CustomerShellProps): React.JSX.Element {
  const t = useTranslations('customer');
  const pathname = usePathname();
  const initials = getInitials(userName);
  const logoutUrl = `${process.env.NEXT_PUBLIC_BFF_URL}/auth/logout?tenantSlug=${tenantSlug}`;

  const homeHref = `/${tenantSlug}/my-account`;
  const bookingsHref = `/${tenantSlug}/my-account/bookings`;
  const loyaltyHref = `/${tenantSlug}/my-account/loyalty`;

  const navItems = [
    { href: homeHref, labelKey: 'nav.home', Icon: Home },
    { href: bookingsHref, labelKey: 'nav.bookings', Icon: Calendar },
    { href: loyaltyHref, labelKey: 'nav.loyalty', Icon: Star },
  ] as const;

  function isActive(href: string): boolean {
    if (href === homeHref) return pathname === homeHref;
    return pathname.startsWith(href);
  }

  const tabItemClass = (active: boolean) =>
    cn(
      'flex items-center gap-1.5 border-b-2 px-4 py-3 text-sm font-medium transition-colors',
      active
        ? 'border-blue-600 text-blue-600'
        : 'border-transparent text-gray-900/40 hover:text-gray-900/70',
    );

  const bottomItemClass = (active: boolean) =>
    cn(
      'flex flex-1 flex-col items-center justify-center gap-1 px-1 py-2 text-[0.625rem] font-semibold tracking-[0.02em] transition-colors',
      active ? 'text-blue-600' : 'text-gray-900/40',
    );

  return (
    <div className="flex min-h-screen flex-col">
      {/* ── Topbar ───────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-gray-100 bg-white px-4 py-3 lg:px-6">
        {/* Brand */}
        <div className="flex items-center gap-2.5">
          <div
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-blue-600 text-[0.8125rem] font-bold text-white"
            aria-hidden="true"
          >
            {tenantName[0]?.toUpperCase() ?? 'I'}
          </div>
          <span className="truncate text-[0.9375rem] font-bold text-gray-900">{tenantName}</span>
        </div>

        {/* Right actions */}
        <div className="ml-auto flex items-center gap-3">
          {/* + Novo agendamento — desktop only */}
          <Link
            href={`/${tenantSlug}/booking`}
            className="hidden items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-[0.8125rem] font-semibold text-white transition-colors hover:bg-blue-700 lg:flex"
          >
            + {t('topbar.newBooking')}
          </Link>

          {/* Avatar dropdown */}
          <details className="relative" data-testid="avatar-dropdown">
            <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-medium [&::-webkit-details-marker]:hidden">
              <Avatar className="h-8 w-8 shrink-0">
                <AvatarFallback className="bg-blue-600 text-xs font-bold text-white">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <span
                className="hidden font-semibold text-gray-900 lg:inline"
                data-testid="topbar-user-name"
              >
                {userName ?? ''}
              </span>
              <ChevronDown className="h-3 w-3 shrink-0 text-gray-900/40" />
            </summary>

            <div className="absolute right-0 top-full z-50 mt-2 min-w-48 overflow-hidden rounded-lg border border-gray-100 bg-white shadow-lg">
              <div className="border-b border-gray-100 px-4 py-3">
                <p className="text-sm font-semibold text-gray-900" data-testid="dropdown-user-name">
                  {userName ?? ''}
                </p>
              </div>
              <Link
                href={`/${tenantSlug}`}
                className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-900/65 hover:bg-gray-50"
              >
                ← {t('topbar.backToSite', { tenantName })}
              </Link>
              <hr className="border-gray-100" />
              <a
                href={logoutUrl}
                className="flex items-center gap-2.5 px-4 py-2.5 text-sm font-medium text-red-600 hover:bg-gray-50"
              >
                {t('topbar.signOut')}
              </a>
            </div>
          </details>
        </div>
      </header>

      {/* ── Desktop tab nav (≥1024px) ───────────────────────────────── */}
      <nav
        className="sticky top-[3.375rem] z-[5] hidden border-b border-gray-100 bg-white px-6 lg:flex"
        aria-label="customer-tabs"
      >
        {navItems.map(({ href, labelKey, Icon }) => (
          <Link key={href} href={href} className={tabItemClass(isActive(href))}>
            <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
            {t(labelKey)}
          </Link>
        ))}
      </nav>

      {/* ── Main content ─────────────────────────────────────────────── */}
      <main className="flex-1 bg-[#f9fafb] p-4 pb-24 lg:p-6 lg:pb-6">{children}</main>

      {/* ── Mobile bottom nav (<1024px) ──────────────────────────────── */}
      <nav
        className="fixed inset-x-0 bottom-0 z-20 flex border-t border-gray-100 bg-white lg:hidden"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0)' }}
        aria-label="customer-bottom-nav"
      >
        {navItems.map(({ href, labelKey, Icon }) => (
          <Link key={href} href={href} className={bottomItemClass(isActive(href))}>
            <Icon className="h-[1.375rem] w-[1.375rem] shrink-0" aria-hidden="true" />
            {t(labelKey)}
          </Link>
        ))}
      </nav>
    </div>
  );
}
