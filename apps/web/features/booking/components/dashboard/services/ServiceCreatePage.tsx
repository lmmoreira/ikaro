'use client';

import { useEffect, useState, type SubmitEvent } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import type { ServiceBookingModel } from '@ikaro/types';
import { useCreateService } from '@/features/booking/services/useServices';
import { toFieldErrors, validateServiceForm } from '@/features/booking/services/service-form';
import { useResolvedLocale } from '@/shared/lib/i18n/use-resolved-locale';
import { useFormFeedback } from '@/shared/lib/feedback/use-form-feedback';
import { Card, CardContent } from '@/shared/components/ui/card';
import { FormActionPane } from '@/shared/components/ui/form-action-pane';
import { ServiceFormFields } from './ServiceFormFields';
import { useDashboardTopbarStatus } from '@/shells/dashboard/components/topbar-status-context';
import { SectionLabel } from '@/shared/components/ui/section-label';
import { SwitchField } from '@/shared/components/ui/switch-field';

export function ServiceCreatePage(): React.JSX.Element {
  const t = useTranslations('dashboard.servicesPage');
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
  const feedback = useFormFeedback();
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
    feedback.clear();
    if (validation.normalized === null) {
      feedback.setError(t('feedbackValidationSummary'));
      feedback.setFieldErrors(toFieldErrors(validation.errors));
      return;
    }

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
      feedback.setFromApiError(err, locale);
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
              <SectionLabel>{t('createBookingModelLabel')}</SectionLabel>
              <div className="grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  data-testid="booking-model-appointment"
                  aria-pressed={bookingModel === 'APPOINTMENT'}
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
                  aria-pressed={bookingModel === 'SESSION'}
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
              feedback={feedback}
              onNameChange={feedback.edit(setName)}
              onDescriptionChange={feedback.edit(setDescription)}
              onPriceAmountChange={feedback.edit(setPriceAmount)}
              onDurationMinutesChange={feedback.edit(setDurationMinutes)}
              onLoyaltyPointsValueChange={feedback.edit(setLoyaltyPointsValue)}
              onToggleRequiresPickupAddress={() => setRequiresPickupAddress((value) => !value)}
              hidePickupToggle={bookingModel === 'SESSION'}
            >
              <section className="space-y-3">
                <SwitchField
                  testId="service-active-switch"
                  checked={isActive}
                  onChange={setIsActive}
                  label={t('createActiveLabel')}
                  hint={t('createActiveHint')}
                />
              </section>
            </ServiceFormFields>
          </CardContent>
        </Card>

        <FormActionPane
          submitLabel={t('createSubmit')}
          cancelLabel={t('createCancel')}
          cancelHref="/dashboard/services"
          desktopSaveTestId="service-create-save-desktop"
          mobileSaveTestId="service-create-save-mobile"
          isSubmitting={isSubmitting}
          feedback={feedback.feedback}
        />
      </div>
    </form>
  );
}
