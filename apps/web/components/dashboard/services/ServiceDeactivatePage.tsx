'use client';

import Link from 'next/link';
import { useState, type SubmitEvent } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { AlertTriangle } from 'lucide-react';
import type { StaffServiceResponse } from '@ikaro/types';
import { ApiError } from '@/lib/api/errors';
import { useDeactivateService } from '@/lib/hooks/useServices';
import { formatDuration } from '@/lib/formatting/format-duration';
import { useFormatting } from '@/lib/formatting/use-formatting';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

interface ServiceDeactivatePageProps {
  readonly service: StaffServiceResponse;
}

export function ServiceDeactivatePage({ service }: ServiceDeactivatePageProps): React.JSX.Element {
  const t = useTranslations('dashboard.servicesPage');
  const commonT = useTranslations('common');
  const { formatMoney } = useFormatting();
  const router = useRouter();
  const deactivateServiceMutation = useDeactivateService();
  const [isSubmittingLocal, setIsSubmittingLocal] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const isSubmitting = isSubmittingLocal || deactivateServiceMutation.isPending;

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setSubmitError(null);

    setIsSubmittingLocal(true);
    try {
      await deactivateServiceMutation.mutateAsync(service.serviceId);
      router.push('/dashboard/services');
    } catch (err) {
      if (err instanceof ApiError) {
        setSubmitError(t('deactivateFailed'));
        return;
      }

      setSubmitError(t('deactivateFailed'));
    } finally {
      setIsSubmittingLocal(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 pb-24 lg:space-y-6 lg:pb-0">
      <Card>
        <CardContent className="space-y-5 p-5 lg:p-6">
          <div className="space-y-2">
            <h2 className="text-[1.0625rem] font-bold text-gray-900">{t('deactivateTitle')}</h2>
            <p className="text-sm leading-6 text-gray-600">{t('deactivateIntro')}</p>
          </div>

          <div className="rounded-2xl bg-slate-50 px-4 py-4">
            <p className="text-base font-bold text-gray-900">{service.name}</p>
            <p className="mt-1 text-sm text-gray-600">
              {formatDuration(service.durationMinutes)} · {formatMoney(service.price.amount)} ·{' '}
              {t('pointsBadge', { count: service.loyaltyPointsValue })}
            </p>
          </div>

          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4">
            <p className="flex items-center gap-2 text-sm font-bold text-amber-900">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              {t('deactivateWarningTitle')}
            </p>
            <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6 text-amber-900/90">
              <li>{t('deactivateWarningHide')}</li>
              <li>{t('deactivateWarningExisting')}</li>
              <li>{t('deactivateWarningReactivate')}</li>
            </ul>
          </div>

          {submitError && (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {submitError}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex gap-3 px-1">
        <Button variant="destructive" type="submit" className="flex-1" disabled={isSubmitting}>
          {isSubmitting ? commonT('loading') : t('deactivateConfirm')}
        </Button>
        <Button asChild variant="outline" className="flex-1">
          <Link href={`/dashboard/services/${service.serviceId}/edit`}>{t('createCancel')}</Link>
        </Button>
      </div>
    </form>
  );
}
