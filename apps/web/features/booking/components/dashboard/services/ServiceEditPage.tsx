'use client';

import { useEffect, useState, type SubmitEvent } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import type { StaffServiceResponse } from '@ikaro/types';
import { useActivateService, useUpdateService } from '@/features/booking/services/useServices';
import type { ServiceFormErrors } from '@/features/booking/services/service-form';
import { validateServiceForm } from '@/features/booking/services/service-form';
import { useResolvedLocale } from '@/shared/lib/i18n/use-resolved-locale';
import { resolveErrorMessageFromApiError } from '@/shared/lib/i18n/resolve-error-message';
import type { SupportedLocale } from '@/shared/lib/i18n/get-messages';
import { Card, CardContent } from '@/shared/components/ui/card';
import { ServiceFormFields } from './ServiceFormFields';
import { ServiceEditActionPanels, ServiceEditStatusSection } from './ServiceEditPanels';
import { useDashboardTopbarStatus } from '@/shells/dashboard/components/topbar-status-context';

interface ServiceEditPageProps {
  readonly service: StaffServiceResponse;
}

function mapSubmitErrors(err: unknown, locale: SupportedLocale): ServiceFormErrors {
  return { submit: resolveErrorMessageFromApiError(err, locale) };
}

export function ServiceEditPage({ service }: ServiceEditPageProps): React.JSX.Element {
  const t = useTranslations('dashboard.servicesPage');
  const locale = useResolvedLocale();
  const router = useRouter();
  const updateServiceMutation = useUpdateService();
  const activateServiceMutation = useActivateService();
  const topbarStatus = useDashboardTopbarStatus();
  const setTopbarServiceStatus = topbarStatus?.setServiceStatus;
  const [name, setName] = useState(service.name);
  const [description, setDescription] = useState(service.description ?? '');
  const [priceAmount, setPriceAmount] = useState(String(service.price.amount));
  const [durationMinutes, setDurationMinutes] = useState(String(service.durationMinutes));
  const [loyaltyPointsValue, setLoyaltyPointsValue] = useState(String(service.loyaltyPointsValue));
  const [requiresPickupAddress, setRequiresPickupAddress] = useState(service.requiresPickupAddress);
  const [isActive, setIsActive] = useState(service.isActive);
  const [fieldErrors, setFieldErrors] = useState<ServiceFormErrors>({});
  const [isSubmittingLocal, setIsSubmittingLocal] = useState(false);
  const [isActivatingLocal, setIsActivatingLocal] = useState(false);

  const isSubmitting = isSubmittingLocal || updateServiceMutation.isPending;
  const isActivating = isActivatingLocal || activateServiceMutation.isPending;

  useEffect(() => {
    setTopbarServiceStatus?.(isActive ? 'ACTIVE' : 'INACTIVE');
  }, [isActive, setTopbarServiceStatus]);

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    if (!isActive) {
      setFieldErrors({ submit: t('editInactiveUpdateBlocked') });
      return;
    }

    const validation = validateServiceForm(
      { name, description, priceAmount, durationMinutes, loyaltyPointsValue },
      t,
    );
    setFieldErrors(validation.errors);
    if (validation.normalized === null) return;

    setIsSubmittingLocal(true);
    try {
      await updateServiceMutation.mutateAsync({
        id: service.serviceId,
        body: { ...validation.normalized, requiresPickupAddress },
      });
      router.push('/dashboard/services');
    } catch (err) {
      setFieldErrors(mapSubmitErrors(err, locale));
    } finally {
      setIsSubmittingLocal(false);
    }
  }

  async function handleActivate(): Promise<void> {
    setFieldErrors({});
    setIsActivatingLocal(true);

    try {
      await activateServiceMutation.mutateAsync(service.serviceId);
      setIsActive(true);
    } catch (err) {
      setFieldErrors(mapSubmitErrors(err, locale));
    } finally {
      setIsActivatingLocal(false);
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
              <ServiceEditStatusSection isActive={isActive} serviceId={service.serviceId} />
            </ServiceFormFields>
          </CardContent>
        </Card>

        <ServiceEditActionPanels
          isActive={isActive}
          isSubmitting={isSubmitting}
          isActivating={isActivating}
          onActivate={handleActivate}
        />
      </div>
    </form>
  );
}
