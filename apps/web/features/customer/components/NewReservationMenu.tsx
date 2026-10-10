'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { ChevronDown } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/components/ui/popover';
import { cn } from '@/shared/utils/cn';
import { recurringScheduleNewPath } from '../recurring-schedule-model';

interface NewReservationMenuProps {
  readonly tenantSlug: string;
  /** Stretches the trigger across its container (Início's mobile button). */
  readonly fullWidth?: boolean;
}

/**
 * The customer's one "create" action: "+ Novo ▾" with a one-off booking and a recurring
 * reservation. The desktop topbar renders it on every my-account screen; on mobile, where the topbar
 * has no room, the pages that offer a create action render the same menu in the page.
 */
export function NewReservationMenu({
  tenantSlug,
  fullWidth = false,
}: NewReservationMenuProps): React.JSX.Element {
  const t = useTranslations('customer.newMenu');
  const [open, setOpen] = useState(false);

  const items = [
    {
      testId: 'new-menu-booking',
      href: `/${tenantSlug}/booking`,
      title: t('booking'),
      hint: t('bookingHint'),
    },
    {
      testId: 'new-menu-recurring',
      href: recurringScheduleNewPath(tenantSlug),
      title: t('recurring'),
      hint: t('recurringHint'),
    },
  ];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-testid="new-menu-trigger"
          className={cn(
            'inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md bg-blue-600 px-3 py-1.5 text-[0.8125rem] font-semibold text-white transition-colors hover:bg-blue-700',
            fullWidth && 'w-full rounded-lg px-4 py-2.5 text-sm',
          )}
        >
          + {t('label')}
          <ChevronDown className="h-3 w-3" aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        role="menu"
        className="w-[17rem] overflow-hidden rounded-xl p-0"
        data-testid="new-menu"
      >
        {items.map((item) => (
          <Link
            key={item.testId}
            href={item.href}
            role="menuitem"
            data-testid={item.testId}
            onClick={() => setOpen(false)}
            className="block border-t border-gray-100 px-4 py-3 first:border-t-0 hover:bg-gray-50"
          >
            <strong className="block text-sm text-gray-900">{item.title}</strong>
            <span className="mt-0.5 block text-xs leading-snug text-gray-500">{item.hint}</span>
          </Link>
        ))}
      </PopoverContent>
    </Popover>
  );
}
