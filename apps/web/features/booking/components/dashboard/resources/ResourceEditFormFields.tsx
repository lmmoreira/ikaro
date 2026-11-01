'use client';

import { useCallback, useState, type SubmitEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type { ResourceResponse, ResourceType, ResourceWorkingHours } from '@ikaro/types';
import { useResourceStaffOptions, useUpdateResource } from '@/features/booking/hooks/useResources';
import { useTenantSettings } from '@/features/platform/hooks/useTenantSettings';
import { ResourceIdentityFields } from './ResourceIdentityFields';
import { ResourceWorkingHoursEditor, toResourceBusinessHours } from './ResourceWorkingHoursEditor';
import { useFormFeedback } from '@/shared/lib/feedback/use-form-feedback';
import { useResolvedLocale } from '@/shared/lib/i18n/use-resolved-locale';
import { Button } from '@/shared/components/ui/button';
import { ActionPane } from '@/shared/components/ui/action-pane';
import { Card, CardContent } from '@/shared/components/ui/card';

const INPUT_CLASS =
  'w-full rounded-md border border-border bg-white px-3 py-2.5 text-sm text-gray-900 outline-none transition-colors placeholder:text-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 aria-[invalid=true]:border-red-500 aria-[invalid=true]:bg-red-50';

interface ResourceEditFormFieldsProps {
  readonly resourceId: string;
  readonly resource: ResourceResponse;
}

export function ResourceEditFormFields({
  resourceId,
  resource,
}: ResourceEditFormFieldsProps): React.JSX.Element {
  const t = useTranslations('dashboard.resourcesPage');
  const locale = useResolvedLocale();
  const router = useRouter();
  const updateResourceMutation = useUpdateResource();
  const { data: staffOptionsData } = useResourceStaffOptions(resourceId);
  const { data: tenantSettingsData } = useTenantSettings();

  const isLocation = resource.type === 'LOCATION';

  const [type, setType] = useState<Exclude<ResourceType, 'LOCATION'>>(
    resource.type === 'LOCATION' ? 'ROOM' : resource.type,
  );
  const [refId, setRefId] = useState(resource.refId ?? '');
  const [name, setName] = useState(resource.name);
  const [workingHours, setWorkingHours] = useState<ResourceWorkingHours | null>(
    resource.workingHours,
  );
  const [turnoverMinutes, setTurnoverMinutes] = useState(String(resource.turnoverMinutes));
  const [maxCapacity, setMaxCapacity] = useState(
    resource.maxCapacity !== null ? String(resource.maxCapacity) : '',
  );
  const feedback = useFormFeedback();
  const [isSubmittingLocal, setIsSubmittingLocal] = useState(false);

  const isSubmitting = isSubmittingLocal || updateResourceMutation.isPending;

  const staffOptions = staffOptionsData?.items ?? [];
  const tenantBusinessHours = tenantSettingsData
    ? toResourceBusinessHours(tenantSettingsData.settings.businessHours)
    : null;

  // ResourceWorkingHoursEditor memoizes its day rows on a stable onChange (see its own comment),
  // so this handler must keep its identity across renders instead of going through edit().
  const { clear: clearFeedback } = feedback;
  const handleWorkingHoursChange = useCallback(
    (value: ResourceWorkingHours | null) => {
      clearFeedback();
      setWorkingHours(value);
    },
    [clearFeedback],
  );

  // An edit removes the previous error or success, as the other migrated forms do.
  function edit<T>(setter: (value: T) => void): (value: T) => void {
    return (value) => {
      feedback.clear();
      setter(value);
    };
  }

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    const errors: Record<string, string> = {};
    if (!isLocation && type === 'STAFF' && !refId) errors.refId = t('errors.staffRequired');
    if (!name.trim()) errors.name = t('errors.nameRequired');
    if (Object.keys(errors).length > 0) {
      feedback.setFieldErrors(errors);
      return;
    }
    feedback.clear();

    setIsSubmittingLocal(true);
    try {
      // A STAFF resource can never carry a capacity (CHECK type != 'STAFF' OR max_capacity IS
      // NULL) — the field is hidden once type switches to STAFF, but its stale value must be
      // discarded here too, not just visually hidden.
      const isStaffTarget = !isLocation && type === 'STAFF';
      const resolvedMaxCapacity = isStaffTarget
        ? null
        : (maxCapacity && Number(maxCapacity)) || null;

      // A LOCATION resource always inherits the tenant's business hours — the editor is locked
      // (no customize toggle) for this type, but workingHours is still forced to null here too:
      // it's the actual field the backend's own ResourceLocationWorkingHoursImmutableError guard
      // enforces, not just a UI nicety (defense in depth, mirrors maxCapacity's isStaffTarget
      // discard above).
      await updateResourceMutation.mutateAsync({
        id: resourceId,
        body: {
          name: name.trim(),
          ...(isLocation ? {} : { type, refId: type === 'STAFF' ? refId : null }),
          workingHours: isLocation ? null : workingHours,
          turnoverMinutes: Number(turnoverMinutes) || 0,
          maxCapacity: resolvedMaxCapacity,
        },
      });
      router.push('/dashboard/resources');
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
            <ResourceIdentityFields
              showTypePicker={!isLocation}
              type={type}
              onTypeChange={edit(setType)}
              refId={refId}
              onRefIdChange={edit(setRefId)}
              name={name}
              onNameChange={edit(setName)}
              staffOptions={staffOptions}
              feedback={feedback}
            />

            <ResourceWorkingHoursEditor
              value={workingHours}
              onChange={handleWorkingHoursChange}
              tenantBusinessHours={tenantBusinessHours}
              locked={isLocation}
            />

            <div>
              <label className="mb-1.5 block text-sm font-semibold text-gray-900">
                {t('turnoverLabel')}
              </label>
              <input
                type="number"
                min={0}
                value={turnoverMinutes}
                onChange={(event) => edit(setTurnoverMinutes)(event.target.value)}
                className={INPUT_CLASS}
              />
              <p className="mt-1.5 text-sm text-gray-500">{t('turnoverHint')}</p>
            </div>

            {(isLocation || type !== 'STAFF') && (
              <div>
                <label className="mb-1.5 block text-sm font-semibold text-gray-900">
                  {t('maxCapacityLabel')}
                </label>
                <input
                  data-testid="resource-max-capacity-input"
                  type="number"
                  min={1}
                  value={maxCapacity}
                  onChange={(event) => edit(setMaxCapacity)(event.target.value)}
                  className={INPUT_CLASS}
                />
                <p className="mt-1.5 text-sm text-gray-500">{t('maxCapacityHint')}</p>
              </div>
            )}
          </CardContent>
        </Card>

        <ActionPane
          actions={
            <>
              <Button
                type="submit"
                data-testid="resource-edit-save-desktop"
                className="w-full"
                disabled={isSubmitting}
              >
                {t('editSubmit')}
              </Button>
              <Button asChild variant="outline" className="w-full">
                <Link href="/dashboard/resources">{t('cancel')}</Link>
              </Button>
            </>
          }
          mobileActions={
            <div className="grid grid-cols-2 gap-3">
              <Button asChild variant="outline" className="w-full">
                <Link href="/dashboard/resources">{t('cancel')}</Link>
              </Button>
              <Button
                type="submit"
                data-testid="resource-edit-save-mobile"
                className="w-full"
                disabled={isSubmitting}
              >
                {t('editSubmit')}
              </Button>
            </div>
          }
          feedback={feedback.feedback}
        />
      </div>
    </form>
  );
}
