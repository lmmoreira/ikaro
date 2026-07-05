'use client';

import Link from 'next/link';
import { CalendarDays } from 'lucide-react';
import { useTranslations } from 'next-intl';

interface BookingEmptyStateProps {
  readonly tenantSlug: string;
}

export function BookingEmptyState({ tenantSlug }: BookingEmptyStateProps): React.JSX.Element {
  const t = useTranslations('customer.emptyState');

  return (
    <section className="flex flex-col items-center rounded-2xl border border-gray-100 bg-white px-6 py-12 text-center shadow-sm">
      <CalendarDays className="h-10 w-10 text-gray-300" aria-hidden="true" />
      <p className="mt-4 text-base font-semibold text-gray-900">{t('title')}</p>
      <p className="mt-1 max-w-sm text-sm text-gray-500">{t('body')}</p>
      <Link
        href={`/${tenantSlug}/booking`}
        className="mt-5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
      >
        {t('cta')}
      </Link>
    </section>
  );
}
