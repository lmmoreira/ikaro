'use client';

import Link from 'next/link';
import { useState, type SubmitEvent } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { AlertTriangle } from 'lucide-react';
import type { ResourceResponse } from '@ikaro/types';
import { useDeactivateResource } from '@/features/booking/hooks/useResources';
import { Button } from '@/shared/components/ui/button';
import { Card, CardContent } from '@/shared/components/ui/card';
import { resolveErrorMessageFromApiError } from '@/shared/lib/i18n/resolve-error-message';
import { useResolvedLocale } from '@/shared/lib/i18n/use-resolved-locale';

interface ResourceDeactivateConfirmProps {
  readonly resource: ResourceResponse;
}

interface DeactivateActionsProps {
  readonly isSubmitting: boolean;
  readonly className: string;
  readonly submitTestId: string;
}

function DeactivateActions({
  isSubmitting,
  className,
  submitTestId,
}: DeactivateActionsProps): React.JSX.Element {
  const t = useTranslations('dashboard.resourcesPage');
  const commonT = useTranslations('common');
  const router = useRouter();

  return (
    <div className={className}>
      <Button
        variant="destructive"
        type="submit"
        data-testid={submitTestId}
        className="w-full"
        disabled={isSubmitting}
      >
        {isSubmitting ? commonT('loading') : t('deactivateConfirm')}
      </Button>
      <Button
        type="button"
        variant="outline"
        className="w-full"
        onClick={() => router.back()}
        disabled={isSubmitting}
      >
        {t('cancel')}
      </Button>
    </div>
  );
}

// No discovery-stage prototype for this screen — built from manager/prototypes/equipe/
// 03-deactivate-confirm.html's shape per dev-notes.md's own flagged gap. Future approved
// appointments/materialized sessions this resource is referenced by would be listed here as
// explicit commitments — empty until Cluster 2+ wires Service.resourceRequirements
// (docs/02-DOMAIN_MODEL.md § Resource; matches UC-047 step 1's own Cluster-1-scope deferral).
export function ResourceDeactivateConfirm({
  resource,
}: ResourceDeactivateConfirmProps): React.JSX.Element {
  const t = useTranslations('dashboard.resourcesPage');
  const locale = useResolvedLocale();
  const router = useRouter();
  const deactivateResourceMutation = useDeactivateResource();
  const [isSubmittingLocal, setIsSubmittingLocal] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isSubmitting = isSubmittingLocal || deactivateResourceMutation.isPending;

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);

    setIsSubmittingLocal(true);
    try {
      await deactivateResourceMutation.mutateAsync(resource.id);
      router.push('/dashboard/resources');
    } catch (err) {
      setError(resolveErrorMessageFromApiError(err, locale));
    } finally {
      setIsSubmittingLocal(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 pb-28 lg:space-y-6 lg:pb-0">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
        <Card>
          <CardContent className="space-y-5 p-5 lg:p-6">
            <div className="space-y-1">
              <h2 className="text-[1.0625rem] font-bold text-gray-900">{t('deactivateTitle')}</h2>
              <p className="text-sm text-gray-500">
                {t('deactivateSubtitle', { name: resource.name })}
              </p>
            </div>

            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4">
              <p className="flex items-center gap-2 text-sm font-bold text-amber-900">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                {t('deactivateWarningTitle')}
              </p>
              <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-6 text-amber-900/90">
                <li>{t('deactivateWarningFuture')}</li>
                <li>{t('deactivateWarningHistory')}</li>
                <li>{t('deactivateWarningReactivate')}</li>
              </ul>
            </div>

            {error && (
              <div
                data-testid="resource-deactivate-error"
                className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
              >
                {error}
              </div>
            )}
          </CardContent>
        </Card>

        <aside className="hidden lg:block lg:sticky lg:top-6">
          <Card>
            <CardContent className="space-y-4 p-4">
              <Button asChild variant="outline" className="w-full">
                <Link href="/dashboard/resources">{t('backToResources')}</Link>
              </Button>
              <DeactivateActions
                isSubmitting={isSubmitting}
                className="space-y-4"
                submitTestId="resource-deactivate-confirm-desktop"
              />
            </CardContent>
          </Card>
        </aside>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-gray-200 bg-white p-4 pb-[calc(0.875rem+env(safe-area-inset-bottom))] shadow-[0_-2px_8px_rgba(0,0,0,0.06)] lg:hidden">
        <DeactivateActions
          isSubmitting={isSubmitting}
          className="grid grid-cols-2 gap-3"
          submitTestId="resource-deactivate-confirm-mobile"
        />
      </div>
    </form>
  );
}
