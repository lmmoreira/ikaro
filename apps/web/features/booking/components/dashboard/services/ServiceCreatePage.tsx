'use client';

import Link from 'next/link';
import { useEffect, useState, type SubmitEvent } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import type { ServiceBookingModel } from '@ikaro/types';
import { useCreateService } from '@/features/booking/services/useServices';
import {
  validateServiceForm,
  type ServiceFormErrors,
} from '@/features/booking/services/service-form';
import { useResolvedLocale } from '@/shared/lib/i18n/use-resolved-locale';
import { resolveErrorMessageFromApiError } from '@/shared/lib/i18n/resolve-error-message';
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
  const [bookingModel, setBookingModel] = useState<ServiceBookingModel>('APPOINTMENT');
  const [isActive, setIsActive] = useState(true);
  const [fieldErrors, setFieldErrors] = useState<ServiceFormErrors>({});
  const [isSubmittingLocal, setIsSubmittingLocal] = useState(false);

  const isSubmitting = isSubmittingLocal || createServiceMutation.isPending;

  useEffect(() => {
    setTopbarServiceStatus?.(isActive ? 'ACTIVE' : 'INACTIVE');
  }, [isActive, setTopbarServiceStatus]);

  function handleSelectBookingModel(nextModel: ServiceBookingModel): void {
    setBookingModel(nextModel);
    // SESSION services have no per-reservation pickup/delivery concept — force off, not just
    // hidden, so a stale `true` value from before the switch never gets submitted (UC-056).
    if (nextModel === 'SESSION') setRequiresPickupAddress(false);
  }

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
      const result = await createServiceMutation.mutateAsync({
        ...validation.normalized,
        description: validation.normalized.description ?? undefined,
        requiresPickupAddress: bookingModel === 'SESSION' ? false : requiresPickupAddress,
        isActive,
        bookingModel,
      });
      // Lands directly on the new service's edit page (Detalhes tab, inline success banner)
      // instead of bouncing back to the list — the M22-S04 Cluster 2 config (Recursos/Políticas/
      // Formulário) only ever makes sense once the service exists (decided 2026-09-17).
      router.push(`/dashboard/services/${result.serviceId}/edit?created=1`);
    } catch (err) {
      setFieldErrors({ submit: resolveErrorMessageFromApiError(err, locale) });
    } finally {
      setIsSubmittingLocal(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 pb-28 lg:space-y-6 lg:pb-0">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
        <Card>
          <CardContent className="space-y-5 p-5 lg:p-6">
            <section className="space-y-2">
              <p className="text-xs font-bold uppercase tracking-[0.07em] text-gray-400">
                {t('createBookingModelLabel')}
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  data-testid="booking-model-appointment"
                  onClick={() => handleSelectBookingModel('APPOINTMENT')}
                  className={`rounded-2xl border p-4 text-left transition-colors ${
                    bookingModel === 'APPOINTMENT'
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <p className="text-sm font-semibold text-gray-900">
                    {t('createBookingModelAppointment')}
                  </p>
                  <p className="mt-0.5 text-xs text-gray-500">
                    {t('createBookingModelAppointmentSub')}
                  </p>
                </button>
                <button
                  type="button"
                  data-testid="booking-model-session"
                  onClick={() => handleSelectBookingModel('SESSION')}
                  className={`rounded-2xl border p-4 text-left transition-colors ${
                    bookingModel === 'SESSION'
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <p className="text-sm font-semibold text-gray-900">
                    {t('createBookingModelSession')}
                  </p>
                  <p className="mt-0.5 text-xs text-gray-500">
                    {t('createBookingModelSessionSub')}
                  </p>
                </button>
              </div>
              <p className="text-xs text-gray-500">{t('createBookingModelImmutableHint')}</p>
            </section>

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
              hidePickupToggle={bookingModel === 'SESSION'}
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
