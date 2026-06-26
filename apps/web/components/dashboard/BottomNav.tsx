'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Calendar, Clock, Wrench, Star, MoreHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';

interface BottomNavProps {
  readonly role: 'STAFF' | 'MANAGER';
  readonly onOpenSheet: () => void;
}

const NAV_ITEMS = [
  { href: '/dashboard/bookings', label: 'Agenda', Icon: Calendar },
  { href: '/dashboard/schedule', label: 'Horários', Icon: Clock },
  { href: '/dashboard/services', label: 'Serviços', Icon: Wrench },
  { href: '/dashboard/loyalty', label: 'Fidelidade', Icon: Star },
] as const;

export function BottomNav({ role, onOpenSheet }: BottomNavProps): React.JSX.Element {
  const pathname = usePathname();

  const itemClass = (active: boolean) =>
    cn(
      'flex flex-1 flex-col items-center justify-center gap-1 px-1 py-2 text-[0.625rem] font-semibold tracking-[0.02em] transition-colors',
      active ? 'text-blue-600' : 'text-gray-900/40',
    );

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-20 flex border-t bg-white lg:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0)' }}
    >
      {NAV_ITEMS.map(({ href, label, Icon }) => {
        const isActive = pathname.startsWith(href);
        return (
          <Link key={href} href={href} className={itemClass(isActive)}>
            <Icon className="h-[1.375rem] w-[1.375rem] shrink-0" />
            {label}
          </Link>
        );
      })}

      {role === 'MANAGER' && (
        <button
          type="button"
          onClick={onOpenSheet}
          className={itemClass(false)}
          aria-label="Mais opções"
        >
          <MoreHorizontal className="h-[1.375rem] w-[1.375rem] shrink-0" />
          Mais
        </button>
      )}
    </nav>
  );
}
