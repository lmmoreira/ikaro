'use client';

import { useCallback, useEffect, useRef, useState, type SubmitEvent } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import type { ServiceIntakeSchemaResponse, StaffServiceResponse } from '@ikaro/types';
import { useActivateService, useUpdateService } from '@/features/booking/services/useServices';
import type { ServiceFormErrors } from '@/features/booking/services/service-form';
import { validateServiceForm } from '@/features/booking/services/service-form';
import { useResolvedLocale } from '@/shared/lib/i18n/use-resolved-locale';
import { useFormFeedback } from '@/shared/lib/feedback/use-form-feedback';
import type { ServiceEditTabKey } from '@/features/booking/types/service';
import { INITIAL_SERVICE_EDIT_DIRTY_STATE } from '@/features/booking/types/service';
import { DiscardChangesDialog } from '@/shared/components/DiscardChangesDialog';
import { useTabFeedback, type ServiceTabAction } from './service-tab-action';
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

// The "service created" banner shows for a moment after the create redirect, then the URL is
// cleaned so a reload does not show it again.
function useCreatedBanner(initial: boolean, serviceId: string): boolean {
  const router = useRouter();
  const [show, setShow] = useState(initial);

  useEffect(() => {
    if (!show) return;
    const timeoutId = globalThis.setTimeout(() => {
      setShow(false);
      router.replace(`/dashboard/services/${serviceId}/edit`, { scroll: false });
    }, 1800);
    return () => globalThis.clearTimeout(timeoutId);
  }, [router, serviceId, show]);

  return show;
}

export function ServiceEditPage({
  service,
  intakeSchema,
  showCreatedBanner: initialShowCreatedBanner = false,
}: ServiceEditPageProps): React.JSX.Element {
  const t = useTranslations('dashboard.servicesPage');
  const locale = useResolvedLocale();
  const showCreatedBanner = useCreatedBanner(initialShowCreatedBanner, service.serviceId);
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
  // Whether the service has legs — from the start, or as soon as a flat→legs save lands in this
  // session. A legged service's duration is its legs' span (computed by the backend, so locked)
  // and it can never be customer-selected, so the policy panel needs the same fact.
  const [hasLegs, setHasLegs] = useState(service.legs !== null);
  // The flat requirements as last saved, for the Políticas tab's recurrence hint.
  const [savedRequirements, setSavedRequirements] = useState(service.resourceRequirements);
  const [loyaltyPointsValue, setLoyaltyPointsValue] = useState(String(service.loyaltyPointsValue));
  const [requiresPickupAddress, setRequiresPickupAddress] = useState(service.requiresPickupAddress);
  // The pickup-address value as last saved, for the Políticas tab's recurrence hint: toggling the
  // switch changes `requiresPickupAddress` at once, but the hint follows only a successful save.
  const [savedRequiresPickupAddress, setSavedRequiresPickupAddress] = useState(
    service.requiresPickupAddress,
  );
  const [isActive, setIsActive] = useState(service.isActive);
  const [fieldErrors, setFieldErrors] = useState<ServiceFormErrors>({});
  const [isSubmittingLocal, setIsSubmittingLocal] = useState(false);
  const [isActivatingLocal, setIsActivatingLocal] = useState(false);
  const form = useFormFeedback();
  const feedback = useTabFeedback(form);

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
    form.clear();
    setTabDirty('detalhes', true);
  }

  useEffect(() => {
    setTopbarServiceStatus?.(isActive ? 'ACTIVE' : 'INACTIVE');
  }, [isActive, setTopbarServiceStatus]);

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
      form.setError(t('editInactiveUpdateBlocked'));
      return;
    }

    const validation = validateServiceForm(
      { name, description, priceAmount, durationMinutes, loyaltyPointsValue },
      t,
    );
    form.clear();
    setFieldErrors(validation.errors);
    if (validation.normalized === null) return;

    const revisionAtSubmit = detalhesEditRevisionRef.current;
    const pickupAtSubmit = requiresPickupAddress;
    setIsSubmittingLocal(true);
    try {
      await updateServiceMutation.mutateAsync({
        id: service.serviceId,
        body: { ...validation.normalized, requiresPickupAddress: pickupAtSubmit },
      });
      setSavedRequiresPickupAddress(pickupAtSubmit);
      if (detalhesEditRevisionRef.current === revisionAtSubmit) {
        setTabDirty('detalhes', false);
        form.setSuccess(t('editSavedBody'));
      }
    } catch (err) {
      form.setFromApiError(err, locale);
    } finally {
      setIsSubmittingLocal(false);
    }
  }

  async function handleActivate(): Promise<void> {
    setFieldErrors({});
    form.clear();
    setIsActivatingLocal(true);

    try {
      await activateServiceMutation.mutateAsync(service.serviceId);
      setIsActive(true);
    } catch (err) {
      form.setFromApiError(err, locale);
    } finally {
      setIsActivatingLocal(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 pb-28 lg:space-y-6 lg:pb-0">
      <ServiceEditTabBar activeTab={activeTab} dirty={dirty} onTabChange={setActiveTab} />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
        <div>
          {/* All 5 panels stay mounted — hidden (not unmounted) via the native `hidden`
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
              durationLocked={hasLegs}
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
            hasLegs={hasLegs}
            resourceRequirements={savedRequirements}
            requiresPickupAddress={savedRequiresPickupAddress}
            onRequirementsSaved={setSavedRequirements}
            intakeSchema={intakeSchema}
            isActive={isActive}
            onTabDirtyChange={setTabDirty}
            onTabActionChange={handleTabActionChange}
            onLegsSaved={(totalSpanMinutes) => {
              setDurationMinutes(String(totalSpanMinutes));
              setHasLegs(true);
            }}
          />
        </div>

        <ServiceEditActionPanels
          isActive={isActive}
          isSubmitting={isSubmitting}
          isActivating={isActivating}
          onActivate={handleActivate}
          showPrimaryAction={activeTab === 'detalhes'}
          tabAction={activeTab === 'detalhes' ? null : (tabActions[activeTab] ?? null)}
          feedback={feedback}
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
