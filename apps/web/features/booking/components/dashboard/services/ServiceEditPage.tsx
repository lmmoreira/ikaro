'use client';

import { useCallback, useEffect, useRef, useState, type SubmitEvent } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import type { ServiceIntakeSchemaResponse, StaffServiceResponse } from '@ikaro/types';
import { useActivateService, useUpdateService } from '@/features/booking/services/useServices';
import type { ServiceFormErrors } from '@/features/booking/services/service-form';
import { validateServiceForm } from '@/features/booking/services/service-form';
import { useResolvedLocale } from '@/shared/lib/i18n/use-resolved-locale';
import { resolveErrorMessageFromApiError } from '@/shared/lib/i18n/resolve-error-message';
import type { SupportedLocale } from '@/shared/lib/i18n/get-messages';
import type { ServiceEditTabKey } from '@/features/booking/types/service';
import { INITIAL_SERVICE_EDIT_DIRTY_STATE } from '@/features/booking/types/service';
import { DiscardChangesDialog } from '@/shared/components/DiscardChangesDialog';
import type { ServiceTabAction } from './service-tab-action';
import { useServiceEditLeaveGuard } from './useServiceEditLeaveGuard';
import { ServiceEditActionPanels } from './ServiceEditPanels';
import { ServiceEditTabBar } from './ServiceEditTabBar';
import { ServiceEditDetailsTab } from './ServiceEditDetailsTab';
import { ServiceEditConfigTabPanels } from './ServiceEditConfigTabPanels';
import { useDashboardTopbarStatus } from '@/shells/dashboard/components/topbar-status-context';

interface ServiceEditPageProps {
  readonly service: StaffServiceResponse;
  readonly intakeSchema: ServiceIntakeSchemaResponse;
  readonly showCreatedBanner?: boolean;
}

function mapSubmitErrors(err: unknown, locale: SupportedLocale): ServiceFormErrors {
  return { submit: resolveErrorMessageFromApiError(err, locale) };
}

export function ServiceEditPage({
  service,
  intakeSchema,
  showCreatedBanner: initialShowCreatedBanner = false,
}: ServiceEditPageProps): React.JSX.Element {
  const t = useTranslations('dashboard.servicesPage');
  const locale = useResolvedLocale();
  const router = useRouter();
  const [showCreatedBanner, setShowCreatedBanner] = useState(initialShowCreatedBanner);
  const updateServiceMutation = useUpdateService();
  const activateServiceMutation = useActivateService();
  const topbarStatus = useDashboardTopbarStatus();
  const setTopbarServiceStatus = topbarStatus?.setServiceStatus;

  const [activeTab, setActiveTab] = useState<ServiceEditTabKey>('detalhes');
  const [dirty, setDirty] = useState(INITIAL_SERVICE_EDIT_DIRTY_STATE);
  const [tabActions, setTabActions] = useState<
    Partial<Record<ServiceEditTabKey, ServiceTabAction | null>>
  >({});
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
  const anyDirty = Object.values(dirty).some(Boolean);
  const { discardConfirmOpen, closeDiscardConfirm, handleCancelClick, handleConfirmDiscard } =
    useServiceEditLeaveGuard(anyDirty);
  // Bumped on every Detalhes field edit — lets a save in flight tell whether a *newer* edit
  // landed while it was pending, so it never clears dirty for an edit it didn't actually persist.
  const detalhesEditRevisionRef = useRef(0);

  function markDetalhesDirty(): void {
    detalhesEditRevisionRef.current += 1;
    setTabDirty('detalhes', true);
  }

  useEffect(() => {
    setTopbarServiceStatus?.(isActive ? 'ACTIVE' : 'INACTIVE');
  }, [isActive, setTopbarServiceStatus]);

  useEffect(() => {
    if (!showCreatedBanner) return;
    const timeoutId = globalThis.setTimeout(() => {
      setShowCreatedBanner(false);
      router.replace(`/dashboard/services/${service.serviceId}/edit`, { scroll: false });
    }, 1800);
    return () => globalThis.clearTimeout(timeoutId);
  }, [router, service.serviceId, showCreatedBanner]);

  function setTabDirty(tab: ServiceEditTabKey, value: boolean): void {
    setDirty((current) => (current[tab] === value ? current : { ...current, [tab]: value }));
  }

  const handleTabActionChange = useCallback(
    (tab: ServiceEditTabKey, action: ServiceTabAction | null): void => {
      setTabActions((current) =>
        current[tab] === action ? current : { ...current, [tab]: action },
      );
    },
    [],
  );

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    // The page is now one <form> so each tab's own save button (all type="button") can sit
    // beside the Detalhes tab's submit button without a second nested <form> — but that also
    // means an Enter keypress inside a Recursos/Políticas field would otherwise submit Detalhes'
    // data. Only the Detalhes tab's own submit button should ever reach this handler for real.
    if (activeTab !== 'detalhes') return;

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

    const revisionAtSubmit = detalhesEditRevisionRef.current;
    setIsSubmittingLocal(true);
    try {
      await updateServiceMutation.mutateAsync({
        id: service.serviceId,
        body: { ...validation.normalized, requiresPickupAddress },
      });
      if (detalhesEditRevisionRef.current === revisionAtSubmit) {
        setTabDirty('detalhes', false);
      }
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
      <ServiceEditTabBar activeTab={activeTab} dirty={dirty} onTabChange={setActiveTab} />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
        <div>
          {/* All 4 panels stay mounted — hidden (not unmounted) via the native `hidden`
              attribute — so switching tabs never discards a panel's own local, unsaved draft
              state. Each panel manages its own dirty/save lifecycle independently either way. */}
          <div
            role="tabpanel"
            id="service-edit-tabpanel-detalhes"
            aria-labelledby="service-edit-tab-detalhes"
            hidden={activeTab !== 'detalhes'}
          >
            <ServiceEditDetailsTab
              serviceId={service.serviceId}
              isActive={isActive}
              showCreatedBanner={showCreatedBanner}
              name={name}
              description={description}
              priceAmount={priceAmount}
              durationMinutes={durationMinutes}
              loyaltyPointsValue={loyaltyPointsValue}
              requiresPickupAddress={requiresPickupAddress}
              fieldErrors={fieldErrors}
              onNameChange={(value) => {
                setName(value);
                markDetalhesDirty();
              }}
              onDescriptionChange={(value) => {
                setDescription(value);
                markDetalhesDirty();
              }}
              onPriceAmountChange={(value) => {
                setPriceAmount(value);
                markDetalhesDirty();
              }}
              onDurationMinutesChange={(value) => {
                setDurationMinutes(value);
                markDetalhesDirty();
              }}
              onLoyaltyPointsValueChange={(value) => {
                setLoyaltyPointsValue(value);
                markDetalhesDirty();
              }}
              onToggleRequiresPickupAddress={() => {
                setRequiresPickupAddress((value) => !value);
                markDetalhesDirty();
              }}
            />
          </div>

          <ServiceEditConfigTabPanels
            activeTab={activeTab}
            service={service}
            intakeSchema={intakeSchema}
            onTabDirtyChange={setTabDirty}
            onTabActionChange={handleTabActionChange}
          />
        </div>

        <ServiceEditActionPanels
          isActive={isActive}
          isSubmitting={isSubmitting}
          isActivating={isActivating}
          onActivate={handleActivate}
          showPrimaryAction={activeTab === 'detalhes'}
          tabAction={activeTab === 'detalhes' ? null : (tabActions[activeTab] ?? null)}
          onCancelClick={handleCancelClick}
        />
      </div>

      <DiscardChangesDialog
        open={discardConfirmOpen}
        title={t('discardConfirmTitle')}
        description={t('discardConfirmDescription')}
        keepEditingLabel={t('discardConfirmKeepEditing')}
        discardLabel={t('discardConfirmDiscardButton')}
        onConfirmDiscard={handleConfirmDiscard}
        onCancel={closeDiscardConfirm}
        confirmTestId="service-discard-confirm"
      />
    </form>
  );
}
