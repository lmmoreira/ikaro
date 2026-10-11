'use client';

import { useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import type {
  ResourceRequirementItem,
  ServiceBookingPolicyItem,
  UpdateServiceBookingPolicyRequest,
} from '@ikaro/types';
import { recurrenceShapeBlockers } from '@/features/booking/model/recurrence-shape';
import { useUpdateServiceBookingPolicy } from '@/features/booking/services/useServices';
import { useResolvedLocale } from '@/shared/lib/i18n/use-resolved-locale';
import { resolveErrorMessageFromApiError } from '@/shared/lib/i18n/resolve-error-message';
import { useRegisterTabAction, type ServiceTabActionChange } from './service-tab-action';
import { PolicyDurationPricingCard } from './PolicyDurationPricingCard';
import { isValidRecurringHorizonDays } from './recurring-horizon';
import {
  PolicyConfirmationCard,
  PolicyBookingWindowCard,
} from './PolicyConfirmationAndWindowCards';
import { PolicyWhoHowCard } from './PolicyWhoHowCard';

interface ServiceBookingPolicyPanelProps {
  readonly serviceId: string;
  readonly initialPolicy: ServiceBookingPolicyItem;
  readonly hasLegs: boolean;
  // Feed the advisory recurrence hint (TD49-S03): the service's flat requirements as last saved and
  // whether it asks for a pickup address.
  readonly resourceRequirements: readonly ResourceRequirementItem[];
  readonly requiresPickupAddress: boolean;
  readonly onDirtyChange: (dirty: boolean) => void;
  readonly onActionChange: ServiceTabActionChange;
}

export function ServiceBookingPolicyPanel({
  serviceId,
  initialPolicy,
  hasLegs,
  resourceRequirements,
  requiresPickupAddress,
  onDirtyChange,
  onActionChange,
}: ServiceBookingPolicyPanelProps): React.JSX.Element {
  const t = useTranslations('dashboard.servicesPage');
  const locale = useResolvedLocale();
  const updatePolicy = useUpdateServiceBookingPolicy();

  const [policy, setPolicy] = useState(initialPolicy);
  const [error, setError] = useState<string | null>(null);
  const [savedMessageVisible, setSavedMessageVisible] = useState(false);
  // Bumped on every edit — lets a save in flight tell whether a *newer* edit landed while it was
  // pending, so it never clears dirty for edits it didn't actually persist (CodeRabbit finding).
  const editRevisionRef = useRef(0);

  function patch(next: Partial<ServiceBookingPolicyItem>): void {
    editRevisionRef.current += 1;
    setPolicy((current) => ({ ...current, ...next }));
    setError(null);
    onDirtyChange(true);
    setSavedMessageVisible(false);
  }

  async function handleSave(): Promise<void> {
    setError(null);
    const revisionAtSubmit = editRevisionRef.current;
    const body: UpdateServiceBookingPolicyRequest = { ...policy };
    try {
      await updatePolicy.mutateAsync({ id: serviceId, body });
      if (editRevisionRef.current === revisionAtSubmit) {
        onDirtyChange(false);
        setSavedMessageVisible(true);
      }
    } catch (err) {
      setError(resolveErrorMessageFromApiError(err, locale));
    }
  }

  useRegisterTabAction(onActionChange, {
    label: t('politicasSaveButton'),
    disabled: updatePolicy.isPending || !isValidRecurringHorizonDays(policy.recurringHorizonDays),
    pending: updatePolicy.isPending,
    onSubmit: handleSave,
  });

  const recurrenceBlockers = recurrenceShapeBlockers({
    bookingModel: 'APPOINTMENT', // this panel exists for appointment services only (UC-055)
    hasLegs,
    requiresPickupAddress,
    durationPolicy: policy.durationPolicy,
    resourceRequirements,
  });

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">{t('politicasIntro')}</p>

      <PolicyDurationPricingCard policy={policy} hasLegs={hasLegs} onPatch={patch} />
      <PolicyConfirmationCard policy={policy} onPatch={patch} />
      <PolicyBookingWindowCard policy={policy} onPatch={patch} />
      <PolicyWhoHowCard policy={policy} onPatch={patch} recurrenceBlockers={recurrenceBlockers} />

      {error && (
        <div
          role="alert"
          data-testid="policy-error"
          className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {error}
        </div>
      )}

      {savedMessageVisible && (
        <p data-testid="policy-saved" className="text-sm text-green-600">
          {t('politicasSavedConfirm')}
        </p>
      )}
    </div>
  );
}
