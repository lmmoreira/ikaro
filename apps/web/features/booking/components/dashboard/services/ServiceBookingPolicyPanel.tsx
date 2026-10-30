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
import { useFormFeedback } from '@/shared/lib/feedback/use-form-feedback';
import {
  useRegisterTabAction,
  useTabFeedback,
  type ServiceTabActionChange,
} from './service-tab-action';
import { validateBookingPolicy } from './policy-validation';
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
  const form = useFormFeedback();
  const feedback = useTabFeedback(form);
  // Bumped on every edit — lets a save in flight tell whether a *newer* edit landed while it was
  // pending, so it never clears dirty for edits it didn't actually persist (CodeRabbit finding).
  const editRevisionRef = useRef(0);

  function patch(next: Partial<ServiceBookingPolicyItem>): void {
    editRevisionRef.current += 1;
    setPolicy((current) => ({ ...current, ...next }));
    form.clear();
    onDirtyChange(true);
  }

  async function handleSave(): Promise<void> {
    const invalid = validateBookingPolicy(policy, {
      durationMinRequired: t('politicasDurationMinRequired'),
      durationMaxRequired: t('politicasDurationMaxRequired'),
      durationIncrementRequired: t('politicasDurationIncrementRequired'),
      durationRangeInvalid: t('politicasDurationRangeInvalid'),
      pricingIncrementRequired: t('politicasPricingIncrementRequired'),
      pricePerIncrementRequired: t('politicasPricePerIncrementRequired'),
    });
    if (Object.keys(invalid).length > 0) {
      form.setError(t('politicasValidationSummary'));
      form.setFieldErrors(invalid);
      return;
    }

    form.clear();
    const revisionAtSubmit = editRevisionRef.current;
    const body: UpdateServiceBookingPolicyRequest = { ...policy };
    try {
      await updatePolicy.mutateAsync({ id: serviceId, body });
      if (editRevisionRef.current === revisionAtSubmit) {
        onDirtyChange(false);
        form.setSuccess(t('politicasSavedBody'));
      }
    } catch (err) {
      form.setFromApiError(err, locale);
    }
  }

  useRegisterTabAction(onActionChange, {
    label: t('politicasSaveButton'),
    disabled: updatePolicy.isPending || !isValidRecurringHorizonDays(policy.recurringHorizonDays),
    pending: updatePolicy.isPending,
    onSubmit: handleSave,
    feedback,
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

      <PolicyDurationPricingCard policy={policy} hasLegs={hasLegs} fields={form} onPatch={patch} />
      <PolicyConfirmationCard policy={policy} onPatch={patch} />
      <PolicyBookingWindowCard policy={policy} fields={form} onPatch={patch} />
      <PolicyWhoHowCard policy={policy} onPatch={patch} recurrenceBlockers={recurrenceBlockers} />
    </div>
  );
}
