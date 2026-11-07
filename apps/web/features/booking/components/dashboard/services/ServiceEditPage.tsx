'use client';

import { useTranslations } from 'next-intl';
import type { ServiceIntakeSchemaResponse, StaffServiceResponse } from '@ikaro/types';
import { useServiceDetailsForm } from '@/features/booking/hooks/useServiceDetailsForm';
import { useServiceEditSession } from '@/features/booking/hooks/useServiceEditSession';
import { useFormFeedback } from '@/shared/lib/feedback/use-form-feedback';
import { DiscardChangesDialog } from '@/shared/components/DiscardChangesDialog';
import { useDashboardTopbarStatus } from '@/shells/dashboard/components/topbar-status-context';
import { useCreatedNotice } from './use-created-notice';
import { useTabFeedback } from './service-tab-action';
import { useServiceEditLeaveGuard } from './useServiceEditLeaveGuard';
import { ServiceEditActionPanels } from './ServiceEditPanels';
import { ServiceEditTabBar } from './ServiceEditTabBar';
import { ServiceEditDetailsTab } from './ServiceEditDetailsTab';
import { ServiceEditConfigTabPanels } from './ServiceEditConfigTabPanels';

interface ServiceEditPageProps {
  readonly service: StaffServiceResponse;
  readonly intakeSchema: ServiceIntakeSchemaResponse;
  readonly justCreated?: boolean;
}

export function ServiceEditPage({
  service,
  intakeSchema,
  justCreated = false,
}: ServiceEditPageProps): React.JSX.Element {
  const t = useTranslations('dashboard.servicesPage');
  const form = useFormFeedback();
  const topbarStatus = useDashboardTopbarStatus();
  const tabFeedback = useTabFeedback(form);
  const created = useCreatedNotice(justCreated, service.serviceId);
  const feedback = tabFeedback ?? created.notice;

  const {
    activeTab,
    setActiveTab,
    dirty,
    anyDirty,
    setTabDirty,
    tabActions,
    handleTabActionChange,
    hasLegs,
    markHasLegs,
    savedRequirements,
    setSavedRequirements,
    isActive,
    isActivating,
    activate,
  } = useServiceEditSession({
    service,
    feedback: form,
    dismissCreatedNotice: created.dismiss,
    onStatusChange: topbarStatus?.setServiceStatus,
  });
  const {
    name,
    description,
    priceAmount,
    durationMinutes,
    loyaltyPointsValue,
    requiresPickupAddress,
    savedRequiresPickupAddress,
    isSubmitting,
    onNameChange,
    onDescriptionChange,
    onPriceAmountChange,
    onDurationMinutesChange,
    onLoyaltyPointsValueChange,
    onToggleRequiresPickupAddress,
    handleSubmit,
    applyLegsDuration,
  } = useServiceDetailsForm({
    service,
    isActive,
    canSubmit: activeTab === 'detalhes',
    feedback: form,
    onDirtyChange: (isDirty) => setTabDirty('detalhes', isDirty),
    dismissCreatedNotice: created.dismiss,
  });
  const { discardConfirmOpen, closeDiscardConfirm, handleCancelClick, handleConfirmDiscard } =
    useServiceEditLeaveGuard(anyDirty);

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
              name={name}
              description={description}
              priceAmount={priceAmount}
              durationMinutes={durationMinutes}
              loyaltyPointsValue={loyaltyPointsValue}
              requiresPickupAddress={requiresPickupAddress}
              durationLocked={hasLegs}
              feedback={form}
              onNameChange={onNameChange}
              onDescriptionChange={onDescriptionChange}
              onPriceAmountChange={onPriceAmountChange}
              onDurationMinutesChange={onDurationMinutesChange}
              onLoyaltyPointsValueChange={onLoyaltyPointsValueChange}
              onToggleRequiresPickupAddress={onToggleRequiresPickupAddress}
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
              applyLegsDuration(totalSpanMinutes);
              markHasLegs();
            }}
          />
        </div>

        <ServiceEditActionPanels
          isActive={isActive}
          isSubmitting={isSubmitting}
          isActivating={isActivating}
          onActivate={activate}
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
