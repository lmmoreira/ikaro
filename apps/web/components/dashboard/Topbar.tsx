'use client';

import { usePathname } from 'next/navigation';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';

interface TopbarProps {
  readonly tenantName: string;
  readonly userName: string | null;
}

const PAGE_TITLES: ReadonlyArray<[string, string]> = [
  ['/dashboard/bookings', 'Agenda'],
  ['/dashboard/schedule', 'Horários'],
  ['/dashboard/services', 'Serviços'],
  ['/dashboard/loyalty', 'Fidelidade'],
  ['/dashboard/team', 'Equipe'],
  ['/dashboard/settings', 'Configurações'],
  ['/dashboard/hotsite', 'Hotsite'],
];

function getInitials(name: string | null): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? '?';
  const last = parts.length > 1 ? (parts.at(-1)?.[0] ?? '') : '';
  return `${first}${last}`.toUpperCase();
}

function todayLabelPtBR(): string {
  const date = new Intl.DateTimeFormat('pt-BR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date());
  return `Hoje, ${date}`;
}

export function Topbar({ tenantName, userName }: TopbarProps): React.JSX.Element {
  const pathname = usePathname();
  const initials = getInitials(userName);
  const pageTitle = PAGE_TITLES.find(([path]) => pathname.startsWith(path))?.[1] ?? 'Dashboard';

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
        {/* Desktop: today's date */}
        <span className="hidden text-[0.8125rem] text-gray-900/50 lg:inline">
          {todayLabelPtBR()}
        </span>

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
