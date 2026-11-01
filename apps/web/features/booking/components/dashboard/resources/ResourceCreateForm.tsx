'use client';

import { useEffect, useState, type SubmitEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type { ResourceType, ResourceWorkingHours } from '@ikaro/types';
import { useCreateResource, useResourceStaffOptions } from '@/features/booking/hooks/useResources';
import { useTenantSettings } from '@/features/platform/hooks/useTenantSettings';
import { useDashboardTopbarStatus } from '@/shells/dashboard/components/topbar-status-context';
import { ResourceIdentityFields } from './ResourceIdentityFields';
import { ResourceWorkingHoursEditor, toResourceBusinessHours } from './ResourceWorkingHoursEditor';
import { useFormFeedback } from '@/shared/lib/feedback/use-form-feedback';
import { useResolvedLocale } from '@/shared/lib/i18n/use-resolved-locale';
import { Button } from '@/shared/components/ui/button';
import { ActionPane } from '@/shared/components/ui/action-pane';
import { Card, CardContent } from '@/shared/components/ui/card';

const INPUT_CLASS =
  'w-full rounded-md border border-border bg-white px-3 py-2.5 text-sm text-gray-900 outline-none transition-colors placeholder:text-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 aria-[invalid=true]:border-red-500 aria-[invalid=true]:bg-red-50';

export function ResourceCreateForm(): React.JSX.Element {
  const t = useTranslations('dashboard.resourcesPage');
  const dashboardT = useTranslations('dashboard');
  const locale = useResolvedLocale();
  const router = useRouter();
  const createResourceMutation = useCreateResource();
  const { data: staffOptionsData } = useResourceStaffOptions();
  const { data: tenantSettingsData } = useTenantSettings();
  const topbarStatus = useDashboardTopbarStatus();
  const setBackHrefOverride = topbarStatus?.setBackHrefOverride;
  const setBackLabelOverride = topbarStatus?.setBackLabelOverride;

  useEffect(() => {
    setBackHrefOverride?.('/dashboard/resources');
    setBackLabelOverride?.(dashboardT('nav.resources'));

    return () => {
      setBackHrefOverride?.(null);
      setBackLabelOverride?.(null);
    };
  }, [dashboardT, setBackHrefOverride, setBackLabelOverride]);

  const [type, setType] = useState<Exclude<ResourceType, 'LOCATION'>>('STAFF');
  const [refId, setRefId] = useState<string>('');
  const [name, setName] = useState('');
  const [workingHours, setWorkingHours] = useState<ResourceWorkingHours | null>(null);
  const [turnoverMinutes, setTurnoverMinutes] = useState('0');
  const [maxCapacity, setMaxCapacity] = useState('');
  const feedback = useFormFeedback();
  const [isSubmittingLocal, setIsSubmittingLocal] = useState(false);

  const isSubmitting = isSubmittingLocal || createResourceMutation.isPending;

  const staffOptions = staffOptionsData?.items ?? [];
  const tenantBusinessHours = tenantSettingsData
    ? toResourceBusinessHours(tenantSettingsData.settings.businessHours)
    : null;

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
    if (type === 'STAFF' && !refId) errors.refId = t('errors.staffRequired');
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
      const resolvedMaxCapacity =
        type === 'STAFF' ? null : (maxCapacity && Number(maxCapacity)) || null;

      await createResourceMutation.mutateAsync({
        type,
        refId: type === 'STAFF' ? refId : undefined,
        name: name.trim(),
        workingHours,
        turnoverMinutes: Number(turnoverMinutes) || 0,
        maxCapacity: resolvedMaxCapacity,
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
              showTypePicker
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
              onChange={edit(setWorkingHours)}
              tenantBusinessHours={tenantBusinessHours}
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
                data-testid="resource-create-save-desktop"
                className="w-full"
                disabled={isSubmitting}
              >
                {t('createSubmit')}
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
                data-testid="resource-create-save-mobile"
                className="w-full"
                disabled={isSubmitting}
              >
                {t('createSubmit')}
              </Button>
            </div>
          }
          feedback={feedback.feedback}
        />
      </div>
    </form>
  );
}
