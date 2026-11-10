'use client';

import { NumberInput } from '@/shared/components/ui/number-input';
import { Label } from '@/shared/components/ui/label';
import { useState, type SubmitEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type { ResourceResponse, ResourceType, ResourceWorkingHours } from '@ikaro/types';
import { useUpdateResource } from '@/features/booking/hooks/useResources';
import { ResourceIdentityFields } from './ResourceIdentityFields';
import { ResourceWorkingHoursEditor } from './ResourceWorkingHoursEditor';
import { useResourceFormSupport } from './use-resource-form-support';
import { useResolvedLocale } from '@/shared/lib/i18n/use-resolved-locale';
import { Card, CardContent } from '@/shared/components/ui/card';
import { FormActionPane } from '@/shared/components/ui/form-action-pane';

interface ResourceEditFormFieldsProps {
  readonly resourceId: string;
  readonly resource: ResourceResponse;
}

export function ResourceEditFormFields({
  resourceId,
  resource,
}: ResourceEditFormFieldsProps): React.JSX.Element {
  const t = useTranslations('dashboard.resourcesPage');
  const tUnits = useTranslations('common.units');
  const locale = useResolvedLocale();
  const router = useRouter();
  const updateResourceMutation = useUpdateResource();

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
  const {
    feedback,
    staffOptions,
    tenantBusinessHours,
    edit,
    handleWorkingHoursChange,
    validateIdentity,
  } = useResourceFormSupport(setWorkingHours, resourceId);
  const [isSubmittingLocal, setIsSubmittingLocal] = useState(false);

  const isSubmitting = isSubmittingLocal || updateResourceMutation.isPending;

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    if (!validateIdentity({ staffRequired: !isLocation && type === 'STAFF', refId, name })) return;
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
              <Label htmlFor="resource-turnover-minutes">{t('turnoverLabel')}</Label>
              <NumberInput
                id="resource-turnover-minutes"
                unit={tUnits('minutes')}
                min={0}
                value={turnoverMinutes}
                onChange={(event) => edit(setTurnoverMinutes)(event.target.value)}
              />
              <p className="mt-1.5 text-sm text-gray-500">{t('turnoverHint')}</p>
            </div>

            {(isLocation || type !== 'STAFF') && (
              <div>
                <Label htmlFor="resource-max-capacity">{t('maxCapacityLabel')}</Label>
                <NumberInput
                  id="resource-max-capacity"
                  data-testid="resource-max-capacity-input"
                  unit={tUnits('spots')}
                  min={1}
                  value={maxCapacity}
                  onChange={(event) => edit(setMaxCapacity)(event.target.value)}
                />
                <p className="mt-1.5 text-sm text-gray-500">{t('maxCapacityHint')}</p>
              </div>
            )}
          </CardContent>
        </Card>

        <FormActionPane
          submitLabel={t('editSubmit')}
          cancelLabel={t('cancel')}
          cancelHref="/dashboard/resources"
          desktopSaveTestId="resource-edit-save-desktop"
          mobileSaveTestId="resource-edit-save-mobile"
          isSubmitting={isSubmitting}
          feedback={feedback.feedback}
        />
      </div>
    </form>
  );
}
