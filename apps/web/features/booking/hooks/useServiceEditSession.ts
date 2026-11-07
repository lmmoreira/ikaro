import { useCallback, useEffect, useState } from 'react';
import type { StaffServiceResponse } from '@ikaro/types';
import { useActivateService } from '@/features/booking/services/useServices';
import type { ServiceEditTabKey, ServiceTabAction } from '@/features/booking/types/service';
import { INITIAL_SERVICE_EDIT_DIRTY_STATE } from '@/features/booking/types/service';
import type { useFormFeedback } from '@/shared/lib/feedback/use-form-feedback';
import { useResolvedLocale } from '@/shared/lib/i18n/use-resolved-locale';

type FormFeedback = ReturnType<typeof useFormFeedback>;
type ServiceStatusListener = (status: 'ACTIVE' | 'INACTIVE') => void;

// Which tab is open, which tabs hold unsaved edits and the primary action each config tab
// registers with the page.
function useEditTabs(dismissCreatedNotice: () => void) {
  const [activeTab, setActiveTab] = useState<ServiceEditTabKey>('detalhes');
  const [dirty, setDirty] = useState(INITIAL_SERVICE_EDIT_DIRTY_STATE);
  const [tabActions, setTabActions] = useState<
    Partial<Record<ServiceEditTabKey, ServiceTabAction | null>>
  >({});
  const anyDirty = Object.values(dirty).some(Boolean);

  // Every tab reports an edit with `true` and a successful save with `false`, so any report
  // means the user acted after landing here: the created notice has served its purpose.
  function setTabDirty(tab: ServiceEditTabKey, value: boolean): void {
    dismissCreatedNotice();
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

  return {
    activeTab,
    setActiveTab,
    dirty,
    anyDirty,
    setTabDirty,
    tabActions,
    handleTabActionChange,
  };
}

// The facts the config tabs report back to the page after a save.
function useConfigTabFacts(service: StaffServiceResponse) {
  // Whether the service has legs — from the start, or as soon as a flat→legs save lands in this
  // session. A legged service's duration is its legs' span (computed by the backend, so locked)
  // and it can never be customer-selected, so the policy panel needs the same fact.
  const [hasLegs, setHasLegs] = useState(service.legs !== null);
  // The flat requirements as last saved, for the Políticas tab's recurrence hint.
  const [savedRequirements, setSavedRequirements] = useState(service.resourceRequirements);

  function markHasLegs(): void {
    setHasLegs(true);
  }

  return { hasLegs, markHasLegs, savedRequirements, setSavedRequirements };
}

// Whether the service is active, the activation request, and the topbar's status badge.
function useServiceActivation(
  service: StaffServiceResponse,
  feedback: FormFeedback,
  onStatusChange: ServiceStatusListener | undefined,
) {
  const locale = useResolvedLocale();
  const activateServiceMutation = useActivateService();
  const [isActive, setIsActive] = useState(service.isActive);
  const [isActivatingLocal, setIsActivatingLocal] = useState(false);

  useEffect(() => {
    onStatusChange?.(isActive ? 'ACTIVE' : 'INACTIVE');
  }, [isActive, onStatusChange]);

  async function activate(): Promise<void> {
    feedback.clear();
    setIsActivatingLocal(true);

    try {
      await activateServiceMutation.mutateAsync(service.serviceId);
      setIsActive(true);
    } catch (err) {
      feedback.setFromApiError(err, locale);
    } finally {
      setIsActivatingLocal(false);
    }
  }

  const isActivating = isActivatingLocal || activateServiceMutation.isPending;
  return { isActive, isActivating, activate };
}

interface UseServiceEditSessionParams {
  readonly service: StaffServiceResponse;
  readonly feedback: FormFeedback;
  readonly dismissCreatedNotice: () => void;
  // Told the service's status on mount and after an activation (the dashboard topbar's badge).
  readonly onStatusChange?: ServiceStatusListener;
}

// What ServiceEditPage coordinates across its five tabs.
export function useServiceEditSession({
  service,
  feedback,
  dismissCreatedNotice,
  onStatusChange,
}: UseServiceEditSessionParams) {
  const tabs = useEditTabs(dismissCreatedNotice);
  const facts = useConfigTabFacts(service);
  const activation = useServiceActivation(service, feedback, onStatusChange);

  return { ...tabs, ...facts, ...activation };
}
