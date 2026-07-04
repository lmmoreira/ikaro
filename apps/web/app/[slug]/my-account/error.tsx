'use client';

import { useTranslations } from 'next-intl';
import { Button } from '@/shared/components/ui/button';

interface MyAccountRouteErrorProps {
  readonly error: Error & { digest?: string };
  readonly reset: () => void;
}

export default function MyAccountRouteError({
  error: _error,
  reset,
}: MyAccountRouteErrorProps): React.JSX.Element {
  const t = useTranslations('customer.error');

  return (
    <section className="flex min-h-[40vh] w-full items-center justify-center px-4 py-10">
      <div
        role="alert"
        className="w-full max-w-lg rounded-2xl border border-gray-200 bg-white p-6 text-center shadow-sm"
      >
        <p className="text-base font-semibold text-gray-900">{t('title')}</p>
        <p className="mt-2 text-sm text-gray-500">{t('body')}</p>
        <Button type="button" variant="secondary" className="mt-5" onClick={reset}>
          {t('retry')}
        </Button>
      </div>
    </section>
  );
}
