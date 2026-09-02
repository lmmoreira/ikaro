'use client';

import Link from 'next/link';
import { useState, type SubmitEvent } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import type { ResourceResponse } from '@ikaro/types';
import { useReactivateResource } from '@/features/booking/hooks/useResources';
import { Button } from '@/shared/components/ui/button';
import { Card, CardContent } from '@/shared/components/ui/card';
import { resolveErrorMessageFromApiError } from '@/shared/lib/i18n/resolve-error-message';
import { useResolvedLocale } from '@/shared/lib/i18n/use-resolved-locale';

interface ResourceReactivateConfirmProps {
  readonly resource: ResourceResponse;
}

// No discovery-stage prototype for this screen (dev-notes.md's own flagged gap) — a simple
// confirm dialog. On success, no ResourceReactivated event is published (descoped during
// M21-S01 story discovery — no consumer exists yet).
export function ResourceReactivateConfirm({
  resource,
}: ResourceReactivateConfirmProps): React.JSX.Element {
  const t = useTranslations('dashboard.resourcesPage');
  const commonT = useTranslations('common');
  const locale = useResolvedLocale();
  const router = useRouter();
  const reactivateResourceMutation = useReactivateResource();
  const [isSubmittingLocal, setIsSubmittingLocal] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isSubmitting = isSubmittingLocal || reactivateResourceMutation.isPending;

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);

    setIsSubmittingLocal(true);
    try {
      await reactivateResourceMutation.mutateAsync(resource.id);
      router.push('/dashboard/resources');
    } catch (err) {
      setError(resolveErrorMessageFromApiError(err, locale));
    } finally {
      setIsSubmittingLocal(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Card>
        <CardContent className="space-y-5 p-5 lg:p-6">
          <div className="space-y-1">
            <h2 className="text-[1.0625rem] font-bold text-gray-900">{t('reactivateTitle')}</h2>
            <p className="text-sm text-gray-500">
              {t('reactivateSubtitle', { name: resource.name })}
            </p>
          </div>

          {error && (
            <div
              data-testid="resource-reactivate-error"
              className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
            >
              {error}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={() => router.back()}
              disabled={isSubmitting}
            >
              {t('cancel')}
            </Button>
            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? commonT('loading') : t('reactivateConfirm')}
            </Button>
          </div>

          <Button asChild variant="outline" className="w-full">
            <Link href="/dashboard/resources">{t('backToResources')}</Link>
          </Button>
        </CardContent>
      </Card>
    </form>
  );
}
