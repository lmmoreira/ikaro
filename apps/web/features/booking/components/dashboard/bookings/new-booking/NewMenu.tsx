'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Button } from '@/shared/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/components/ui/popover';

interface NewMenuItem {
  readonly key: string;
  readonly href: string;
}

// One "+ Novo" button, never a second one: a new kind of "create on a customer's behalf" is one
// more entry here. Both start at the shared customer chooser, which reads `?tipo=`.
export const NEW_MENU_ITEMS: readonly NewMenuItem[] = [
  { key: 'agendamento', href: '/dashboard/bookings/new?tipo=agendamento' },
  { key: 'recorrencia', href: '/dashboard/bookings/new?tipo=recorrencia' },
];

interface NewMenuProps {
  readonly items?: readonly NewMenuItem[];
}

export function NewMenu({ items = NEW_MENU_ITEMS }: NewMenuProps): React.JSX.Element {
  const t = useTranslations('dashboard.newBooking.menu');
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" data-testid="new-menu-trigger" aria-haspopup="menu">
          {t('trigger')}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 p-1" role="menu" data-testid="new-menu">
        {items.map((item) => (
          <Link
            key={item.key}
            href={item.href}
            role="menuitem"
            data-testid="new-menu-item"
            data-item={item.key}
            onClick={() => setOpen(false)}
            className="block rounded-md px-3 py-2 hover:bg-gray-50"
          >
            <span className="block text-sm font-semibold text-gray-900">
              {t(`items.${item.key}.label`)}
            </span>
            <span className="block text-xs text-gray-500">{t(`items.${item.key}.hint`)}</span>
          </Link>
        ))}
      </PopoverContent>
    </Popover>
  );
}
