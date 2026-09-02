'use client';

import { useState, type SubmitEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type { ResourceResponse, ResourceType, ResourceWorkingHours } from '@ikaro/types';
import { useResourceStaffOptions, useUpdateResource } from '@/features/booking/hooks/useResources';
import { ResourceIdentityFields } from './ResourceIdentityFields';
import { ResourceWorkingHoursEditor } from './ResourceWorkingHoursEditor';
import { resolveErrorMessageFromApiError } from '@/shared/lib/i18n/resolve-error-message';
import { useResolvedLocale } from '@/shared/lib/i18n/use-resolved-locale';
import { Button } from '@/shared/components/ui/button';
import { Card, CardContent } from '@/shared/components/ui/card';

const INPUT_CLASS =
  'w-full rounded-md border border-border bg-white px-3 py-2.5 text-sm text-gray-900 outline-none transition-colors placeholder:text-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 aria-[invalid=true]:border-red-500 aria-[invalid=true]:bg-red-50';

interface ResourceEditFormErrors {
  name?: string;
  refId?: string;
  submit?: string;
}

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
  const [fieldErrors, setFieldErrors] = useState<ResourceEditFormErrors>({});
  const [isSubmittingLocal, setIsSubmittingLocal] = useState(false);

  const isSubmitting = isSubmittingLocal || updateResourceMutation.isPending;

  const staffOptions = staffOptionsData?.items ?? [];

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    const errors: ResourceEditFormErrors = {};
    if (!isLocation && type === 'STAFF' && !refId) errors.refId = t('errors.staffRequired');
    if (!isLocation && type !== 'STAFF' && !name.trim()) errors.name = t('errors.nameRequired');
    if (isLocation && !name.trim()) errors.name = t('errors.nameRequired');
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }
    setFieldErrors({});

    setIsSubmittingLocal(true);
    try {
      // A STAFF resource can never carry a capacity (CHECK type != 'STAFF' OR max_capacity IS
      // NULL) — the field is hidden once type switches to STAFF, but its stale value must be
      // discarded here too, not just visually hidden.
      const isStaffTarget = !isLocation && type === 'STAFF';
      const resolvedMaxCapacity = isStaffTarget
        ? null
        : (maxCapacity && Number(maxCapacity)) || null;

      await updateResourceMutation.mutateAsync({
        id: resourceId,
        body: {
          name: isStaffTarget
            ? (staffOptions.find((s) => s.id === refId)?.name ?? name)
            : name.trim(),
          ...(isLocation ? {} : { type, refId: type === 'STAFF' ? refId : null }),
          workingHours,
          turnoverMinutes: Number(turnoverMinutes) || 0,
          maxCapacity: resolvedMaxCapacity,
        },
      });
      router.push('/dashboard/resources');
    } catch (err) {
      setFieldErrors({ submit: resolveErrorMessageFromApiError(err, locale) });
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
              onTypeChange={setType}
              refId={refId}
              onRefIdChange={setRefId}
              name={name}
              onNameChange={setName}
              staffOptions={staffOptions}
              nameError={fieldErrors.name}
              refIdError={fieldErrors.refId}
            />

            <ResourceWorkingHoursEditor value={workingHours} onChange={setWorkingHours} />

            <div>
              <label className="mb-1.5 block text-sm font-semibold text-gray-900">
                {t('turnoverLabel')}
              </label>
              <input
                type="number"
                min={0}
                value={turnoverMinutes}
                onChange={(event) => setTurnoverMinutes(event.target.value)}
                className={INPUT_CLASS}
              />
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
                  onChange={(event) => setMaxCapacity(event.target.value)}
                  className={INPUT_CLASS}
                />
              </div>
            )}

            {fieldErrors.submit && (
              <div
                data-testid="resource-edit-submit-error"
                className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
              >
                {fieldErrors.submit}
              </div>
            )}
          </CardContent>
        </Card>

        <aside className="hidden lg:block lg:sticky lg:top-6">
          <Card>
            <CardContent className="space-y-4 p-4">
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
            </CardContent>
          </Card>
        </aside>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-gray-200 bg-white p-4 pb-[calc(0.875rem+env(safe-area-inset-bottom))] shadow-[0_-2px_8px_rgba(0,0,0,0.06)] lg:hidden">
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
      </div>
    </form>
  );
}
