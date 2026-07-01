'use client';

import Link from 'next/link';
import { useEffect, useState, type SubmitEvent } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import type { StaffServiceResponse } from '@ikaro/types';
import { ApiError } from '@/lib/api/errors';
import { useActivateService, useUpdateService } from '@/lib/hooks/useServices';
import type { ServiceFormTranslator, ServiceFormErrors } from '@/lib/dashboard/service-form';
import { validateServiceForm } from '@/lib/dashboard/service-form';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ServiceFormFields } from './ServiceFormFields';
import { useDashboardTopbarStatus } from '../topbar-status-context';

interface ServiceEditPageProps {
  readonly service: StaffServiceResponse;
}

const DEACTIVATED_SERVICE_CONFLICT_DETAIL = 'cannot update a deactivated service';
const NAME_CONFLICT_DETAIL = 'already exists';

function mapSubmitErrors(err: unknown, t: ServiceFormTranslator): ServiceFormErrors {
  if (err instanceof ApiError && err.status === 409) {
    const detail = err.detail.toLowerCase();
    if (detail.includes(DEACTIVATED_SERVICE_CONFLICT_DETAIL)) {
      return { submit: t('editInactiveUpdateBlocked') };
    }

    if (detail.includes(NAME_CONFLICT_DETAIL)) {
      return { name: t('createDuplicateName') };
    }
  }

  return { submit: t('editFailed') };
}

interface ServiceEditStatusSectionProps {
  readonly isActive: boolean;
  readonly serviceId: string;
}

function ServiceEditStatusSection({
  isActive,
  serviceId,
}: ServiceEditStatusSectionProps): React.JSX.Element {
  const t = useTranslations('dashboard.servicesPage');

  if (isActive) {
    return (
      <section className="space-y-3 border-t border-red-200 pt-6">
        <p className="text-xs font-bold uppercase tracking-[0.07em] text-red-500">
          {t('editDangerZoneTitle')}
        </p>
        <p className="text-sm leading-6 text-gray-600">{t('editDangerZoneDescription')}</p>
        <Button asChild variant="destructive" className="w-full sm:w-auto">
          <Link
            data-testid="service-deactivate-link"
            href={`/dashboard/services/${serviceId}/deactivate`}
          >
            {t('editDeactivate')}
          </Link>
        </Button>
      </section>
    );
  }

  return (
    <section className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
      <p className="text-xs font-bold uppercase tracking-[0.07em] text-slate-500">
        {t('editInactiveTitle')}
      </p>
      <p className="text-sm leading-6 text-gray-600">{t('editInactiveDescription')}</p>
    </section>
  );
}

interface ServiceEditActionPanelsProps {
  readonly isActive: boolean;
  readonly isSubmitting: boolean;
  readonly isActivating: boolean;
  readonly onActivate: () => void;
}

interface ServiceEditPrimaryActionProps extends ServiceEditActionPanelsProps {
  readonly testIdPrefix: string;
}

function ServiceEditPrimaryAction({
  isActive,
  isSubmitting,
  isActivating,
  onActivate,
  testIdPrefix,
}: ServiceEditPrimaryActionProps): React.JSX.Element {
  const t = useTranslations('dashboard.servicesPage');
  const commonT = useTranslations('common');

  if (isActive) {
    return (
      <Button
        type="submit"
        data-testid={`${testIdPrefix}-save-button`}
        className="w-full"
        disabled={isSubmitting}
      >
        {isSubmitting ? commonT('loading') : t('editSave')}
      </Button>
    );
  }

  return (
    <Button
      type="button"
      data-testid={`${testIdPrefix}-activate-button`}
      className="w-full"
      disabled={isActivating}
      onClick={onActivate}
    >
      {isActivating ? commonT('loading') : t('editActivate')}
    </Button>
  );
}

function ServiceEditActionPanels({
  isActive,
  isSubmitting,
  isActivating,
  onActivate,
}: ServiceEditActionPanelsProps): React.JSX.Element {
  const t = useTranslations('dashboard.servicesPage');

  return (
    <>
      <aside className="hidden lg:block lg:sticky lg:top-6">
        <Card>
          <CardContent className="space-y-4 p-4">
            {!isActive && (
              <p className="text-sm leading-6 text-gray-600">{t('editInactiveDescription')}</p>
            )}

            <ServiceEditPrimaryAction
              isActive={isActive}
              isSubmitting={isSubmitting}
              isActivating={isActivating}
              onActivate={onActivate}
              testIdPrefix="service-desktop"
            />

            <Button asChild variant="outline" className="w-full">
              <Link data-testid="service-cancel-desktop-link" href="/dashboard/services">
                {t('createCancel')}
              </Link>
            </Button>
          </CardContent>
        </Card>
      </aside>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-gray-200 bg-white p-4 pb-[calc(0.875rem+env(safe-area-inset-bottom))] shadow-[0_-2px_8px_rgba(0,0,0,0.06)] lg:hidden">
        <div className="grid grid-cols-2 gap-3">
          <Button asChild variant="outline" className="w-full">
            <Link data-testid="service-cancel-mobile-link" href="/dashboard/services">
              {t('createCancel')}
            </Link>
          </Button>
          <ServiceEditPrimaryAction
            isActive={isActive}
            isSubmitting={isSubmitting}
            isActivating={isActivating}
            onActivate={onActivate}
            testIdPrefix="service-mobile"
          />
        </div>
      </div>
    </>
  );
}

export function ServiceEditPage({ service }: ServiceEditPageProps): React.JSX.Element {
  const t = useTranslations('dashboard.servicesPage');
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
      setFieldErrors(mapSubmitErrors(err, t));
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
    } catch {
      setFieldErrors({ submit: t('editActivateFailed') });
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
