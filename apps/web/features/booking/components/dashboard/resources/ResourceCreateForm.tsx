'use client';

import { useState, type SubmitEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type { ResourceType, ResourceWorkingHours } from '@ikaro/types';
import { useCreateResource, useResourceStaffOptions } from '@/features/booking/hooks/useResources';
import { ResourceIdentityFields } from './ResourceIdentityFields';
import { ResourceWorkingHoursEditor } from './ResourceWorkingHoursEditor';
import { resolveErrorMessageFromApiError } from '@/shared/lib/i18n/resolve-error-message';
import { useResolvedLocale } from '@/shared/lib/i18n/use-resolved-locale';
import { Button } from '@/shared/components/ui/button';
import { Card, CardContent } from '@/shared/components/ui/card';

const INPUT_CLASS =
  'w-full rounded-md border border-border bg-white px-3 py-2.5 text-sm text-gray-900 outline-none transition-colors placeholder:text-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 aria-[invalid=true]:border-red-500 aria-[invalid=true]:bg-red-50';

interface ResourceCreateFormErrors {
  name?: string;
  refId?: string;
  submit?: string;
}

export function ResourceCreateForm(): React.JSX.Element {
  const t = useTranslations('dashboard.resourcesPage');
  const locale = useResolvedLocale();
  const router = useRouter();
  const createResourceMutation = useCreateResource();
  const { data: staffOptionsData } = useResourceStaffOptions();

  const [type, setType] = useState<Exclude<ResourceType, 'LOCATION'>>('STAFF');
  const [refId, setRefId] = useState<string>('');
  const [name, setName] = useState('');
  const [workingHours, setWorkingHours] = useState<ResourceWorkingHours | null>(null);
  const [turnoverMinutes, setTurnoverMinutes] = useState('0');
  const [maxCapacity, setMaxCapacity] = useState('');
  const [fieldErrors, setFieldErrors] = useState<ResourceCreateFormErrors>({});
  const [isSubmittingLocal, setIsSubmittingLocal] = useState(false);

  const isSubmitting = isSubmittingLocal || createResourceMutation.isPending;

  const staffOptions = staffOptionsData?.items ?? [];

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    const errors: ResourceCreateFormErrors = {};
    if (type === 'STAFF' && !refId) errors.refId = t('errors.staffRequired');
    if (type !== 'STAFF' && !name.trim()) errors.name = t('errors.nameRequired');
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
      const resolvedMaxCapacity =
        type === 'STAFF' ? null : (maxCapacity && Number(maxCapacity)) || null;

      await createResourceMutation.mutateAsync({
        type,
        refId: type === 'STAFF' ? refId : undefined,
        name:
          type === 'STAFF' ? (staffOptions.find((s) => s.id === refId)?.name ?? '') : name.trim(),
        workingHours,
        turnoverMinutes: Number(turnoverMinutes) || 0,
        maxCapacity: resolvedMaxCapacity,
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
              showTypePicker
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
              <p className="mt-1.5 text-sm text-gray-500">{t('turnoverHint')}</p>
            </div>

            {type !== 'STAFF' && (
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
                <p className="mt-1.5 text-sm text-gray-500">{t('maxCapacityHint')}</p>
              </div>
            )}

            {fieldErrors.submit && (
              <div
                data-testid="resource-create-submit-error"
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
                data-testid="resource-create-save-desktop"
                className="w-full"
                disabled={isSubmitting}
              >
                {t('createSubmit')}
              </Button>
            </CardContent>
          </Card>
        </aside>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-gray-200 bg-white p-4 pb-[calc(0.875rem+env(safe-area-inset-bottom))] shadow-[0_-2px_8px_rgba(0,0,0,0.06)] lg:hidden">
        <Button
          type="submit"
          data-testid="resource-create-save-mobile"
          className="w-full"
          disabled={isSubmitting}
        >
          {t('createSubmit')}
        </Button>
      </div>
    </form>
  );
}
