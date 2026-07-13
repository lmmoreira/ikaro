'use client';

import Link from 'next/link';
import { useEffect, useState, type SubmitEvent } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import type { ProblemDetail } from '@ikaro/types';
import { ApiError } from '@/shared/lib/api/errors';
import { useCreateService } from '@/features/booking/services/useServices';
import {
  validateServiceForm,
  type ServiceFormErrors,
} from '@/features/booking/services/service-form';
import { useResolvedLocale } from '@/shared/lib/i18n/use-resolved-locale';
import { resolveErrorMessage } from '@/shared/lib/i18n/resolve-error-message';
import { Button } from '@/shared/components/ui/button';
import { Card, CardContent } from '@/shared/components/ui/card';
import { ServiceFormFields } from './ServiceFormFields';
import { useDashboardTopbarStatus } from '@/shells/dashboard/components/topbar-status-context';

export function ServiceCreatePage(): React.JSX.Element {
  const t = useTranslations('dashboard.servicesPage');
  const commonT = useTranslations('common');
  const locale = useResolvedLocale();
  const router = useRouter();
  const createServiceMutation = useCreateService();
  const topbarStatus = useDashboardTopbarStatus();
  const setTopbarServiceStatus = topbarStatus?.setServiceStatus;
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [priceAmount, setPriceAmount] = useState('');
  const [durationMinutes, setDurationMinutes] = useState('');
  const [loyaltyPointsValue, setLoyaltyPointsValue] = useState('0');
  const [requiresPickupAddress, setRequiresPickupAddress] = useState(false);
  const [isActive, setIsActive] = useState(true);
  const [fieldErrors, setFieldErrors] = useState<ServiceFormErrors>({});
  const [isSubmittingLocal, setIsSubmittingLocal] = useState(false);

  const isSubmitting = isSubmittingLocal || createServiceMutation.isPending;

  useEffect(() => {
    setTopbarServiceStatus?.(isActive ? 'ACTIVE' : 'INACTIVE');
  }, [isActive, setTopbarServiceStatus]);

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    const validation = validateServiceForm(
      { name, description, priceAmount, durationMinutes, loyaltyPointsValue },
      t,
    );
    setFieldErrors(validation.errors);
    if (validation.normalized === null) return;

    setIsSubmittingLocal(true);
    try {
      await createServiceMutation.mutateAsync({
        ...validation.normalized,
        description: validation.normalized.description ?? undefined,
        requiresPickupAddress,
        isActive,
      });
      router.push('/dashboard/services?created=1');
    } catch (err) {
      const code =
        err instanceof ApiError ? (err.data as ProblemDetail | undefined)?.code : undefined;
      setFieldErrors({ submit: resolveErrorMessage(code, locale) });
    } finally {
      setIsSubmittingLocal(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 pb-28 lg:space-y-6 lg:pb-0">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
        <Card>
          <CardContent className="space-y-5 p-5 lg:p-6">
            <ServiceFormFields
              name={name}
              description={description}
              priceAmount={priceAmount}
              durationMinutes={durationMinutes}
              loyaltyPointsValue={loyaltyPointsValue}
              requiresPickupAddress={requiresPickupAddress}
              fieldErrors={fieldErrors}
              onNameChange={setName}
              onDescriptionChange={setDescription}
              onPriceAmountChange={setPriceAmount}
              onDurationMinutesChange={setDurationMinutes}
              onLoyaltyPointsValueChange={setLoyaltyPointsValue}
              onToggleRequiresPickupAddress={() => setRequiresPickupAddress((value) => !value)}
            >
              <section className="space-y-3">
                <button
                  type="button"
                  role="switch"
                  data-testid="service-active-switch"
                  aria-checked={isActive}
                  onClick={() => setIsActive((value) => !value)}
                  className="flex w-full items-center justify-between rounded-2xl bg-slate-50 px-4 py-3 text-left transition-colors hover:bg-slate-100"
                >
                  <span className="pr-4">
                    <span className="block text-sm font-semibold text-gray-900">
                      {t('createActiveLabel')}
                    </span>
                    <span className="mt-0.5 block text-sm text-gray-500">
                      {t('createActiveHint')}
                    </span>
                  </span>
                  <span
                    className={`relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors ${
                      isActive ? 'bg-blue-600' : 'bg-slate-300'
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
                        isActive ? 'translate-x-5' : 'translate-x-0.5'
                      }`}
                    />
                  </span>
                </button>
              </section>
            </ServiceFormFields>
          </CardContent>
        </Card>

        <aside className="hidden lg:block lg:sticky lg:top-6">
          <Card>
            <CardContent className="space-y-4 p-4">
              <p className="text-sm leading-6 text-gray-600">{t('createActiveHint')}</p>

              <Button type="submit" className="w-full" disabled={isSubmitting}>
                {isSubmitting ? commonT('loading') : t('createSubmit')}
              </Button>

              <Button asChild variant="outline" className="w-full">
                <Link href="/dashboard/services">{t('createCancel')}</Link>
              </Button>
            </CardContent>
          </Card>
        </aside>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-gray-200 bg-white p-4 pb-[calc(0.875rem+env(safe-area-inset-bottom))] shadow-[0_-2px_8px_rgba(0,0,0,0.06)] lg:hidden">
        <div className="grid grid-cols-2 gap-3">
          <Button asChild variant="outline" className="w-full">
            <Link href="/dashboard/services">{t('createCancel')}</Link>
          </Button>
          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? commonT('loading') : t('createSubmit')}
          </Button>
        </div>
      </div>
    </form>
  );
}
