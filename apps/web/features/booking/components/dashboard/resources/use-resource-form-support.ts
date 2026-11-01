'use client';

import { useCallback } from 'react';
import { useTranslations } from 'next-intl';
import type { ResourceWorkingHours } from '@ikaro/types';
import { useResourceStaffOptions } from '@/features/booking/hooks/useResources';
import { useTenantSettings } from '@/features/platform/hooks/useTenantSettings';
import { useFormFeedback } from '@/shared/lib/feedback/use-form-feedback';
import { toResourceBusinessHours } from './ResourceWorkingHoursEditor';

interface IdentityValues {
  readonly staffRequired: boolean;
  readonly refId: string;
  readonly name: string;
}

function useResourceFormData(resourceId?: string) {
  const { data: staffOptionsData } = useResourceStaffOptions(resourceId);
  const { data: tenantSettingsData } = useTenantSettings();

  return {
    staffOptions: staffOptionsData?.items ?? [],
    tenantBusinessHours: tenantSettingsData
      ? toResourceBusinessHours(tenantSettingsData.settings.businessHours)
      : null,
  };
}

// What the create and the edit form share: the feedback hook, the data the identity and hours
// fields read, the "an edit clears the old message" wrapper, and the identity validation.
// `setWorkingHours` must be a stable setter (a useState setter): the handler built from it keeps
// its identity so ResourceWorkingHoursEditor can keep memoizing its day rows.
export function useResourceFormSupport(
  setWorkingHours: (value: ResourceWorkingHours | null) => void,
  resourceId?: string,
) {
  const t = useTranslations('dashboard.resourcesPage');
  const feedback = useFormFeedback();
  const { clear: clearFeedback, setFieldErrors } = feedback;
  const { staffOptions, tenantBusinessHours } = useResourceFormData(resourceId);

  // An edit removes the previous error or success, as the other migrated forms do.
  function edit<T>(setter: (value: T) => void): (value: T) => void {
    return (value) => {
      clearFeedback();
      setter(value);
    };
  }

  const handleWorkingHoursChange = useCallback(
    (value: ResourceWorkingHours | null) => {
      clearFeedback();
      setWorkingHours(value);
    },
    [clearFeedback, setWorkingHours],
  );

  // Marks and focuses every invalid identity field; returns whether the form may be submitted.
  function validateIdentity({ staffRequired, refId, name }: IdentityValues): boolean {
    const errors: Record<string, string> = {};
    if (staffRequired && !refId) errors.refId = t('errors.staffRequired');
    if (!name.trim()) errors.name = t('errors.nameRequired');
    if (Object.keys(errors).length === 0) return true;

    setFieldErrors(errors);
    return false;
  }

  return {
    feedback,
    staffOptions,
    tenantBusinessHours,
    edit,
    handleWorkingHoursChange,
    validateIdentity,
  };
}
