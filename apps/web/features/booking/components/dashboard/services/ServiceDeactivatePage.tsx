'use client';

import Link from 'next/link';
import { useEffect, useState, type SubmitEvent } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { AlertTriangle } from 'lucide-react';
import type { StaffServiceResponse } from '@ikaro/types';
import { useDeactivateService } from '@/features/booking/services/useServices';
import { formatDuration } from '@/shared/lib/formatting/format-duration';
import { useFormatting } from '@/shared/lib/formatting/use-formatting';
import { Button } from '@/shared/components/ui/button';
import { Card, CardContent } from '@/shared/components/ui/card';
import { useDashboardTopbarStatus } from '@/shells/dashboard/components/topbar-status-context';

interface ServiceDeactivatePageProps {
  readonly service: StaffServiceResponse;
}

interface ServiceDeactivateActionsProps {
  readonly serviceId: string;
  readonly isSubmitting: boolean;
  readonly className: string;
}

function ServiceDeactivateActions({
  serviceId,
  isSubmitting,
  className,
}: ServiceDeactivateActionsProps): React.JSX.Element {
  const t = useTranslations('dashboard.servicesPage');
  const commonT = useTranslations('common');

  return (
    <div className={className}>
      <Button variant="destructive" type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? commonT('loading') : t('deactivateConfirm')}
      </Button>
      <Button asChild variant="outline" className="w-full">
        <Link href={`/dashboard/services/${serviceId}/edit`}>{t('createCancel')}</Link>
      </Button>
    </div>
  );
}

export function ServiceDeactivatePage({ service }: ServiceDeactivatePageProps): React.JSX.Element {
  const t = useTranslations('dashboard.servicesPage');
  const { formatMoney } = useFormatting();
  const router = useRouter();
  const deactivateServiceMutation = useDeactivateService();
  const topbarStatus = useDashboardTopbarStatus();
  const setTopbarServiceStatus = topbarStatus?.setServiceStatus;
  const [isSubmittingLocal, setIsSubmittingLocal] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const isSubmitting = isSubmittingLocal || deactivateServiceMutation.isPending;

  useEffect(() => {
    setTopbarServiceStatus?.(service.isActive ? 'ACTIVE' : 'INACTIVE');
  }, [service.isActive, setTopbarServiceStatus]);

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setSubmitError(null);

    setIsSubmittingLocal(true);
    try {
      await deactivateServiceMutation.mutateAsync(service.serviceId);
      setTopbarServiceStatus?.('INACTIVE');
      router.push('/dashboard/services');
    } catch {
      setSubmitError(t('deactivateFailed'));
    } finally {
      setIsSubmittingLocal(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 pb-28 lg:space-y-6 lg:pb-0">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
        <div className="space-y-4">
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
        </div>

        <aside className="hidden lg:block lg:sticky lg:top-6">
          <Card>
            <CardContent className="space-y-4 p-4">
              <p className="text-sm leading-6 text-gray-600">{t('deactivateIntro')}</p>
              <ServiceDeactivateActions
                serviceId={service.serviceId}
                isSubmitting={isSubmitting}
                className="space-y-4"
              />
            </CardContent>
          </Card>
        </aside>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-gray-200 bg-white p-4 pb-[calc(0.875rem+env(safe-area-inset-bottom))] shadow-[0_-2px_8px_rgba(0,0,0,0.06)] lg:hidden">
        <ServiceDeactivateActions
          serviceId={service.serviceId}
          isSubmitting={isSubmitting}
          className="space-y-3"
        />
      </div>
    </form>
  );
}
