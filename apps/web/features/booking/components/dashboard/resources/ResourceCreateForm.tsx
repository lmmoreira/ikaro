'use client';

import { NumberInput } from '@/shared/components/ui/number-input';
import { Label } from '@/shared/components/ui/label';
import { useEffect, useState, type SubmitEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type { ResourceType, ResourceWorkingHours } from '@ikaro/types';
import { useCreateResource } from '@/features/booking/hooks/useResources';
import { useDashboardTopbarStatus } from '@/shells/dashboard/components/topbar-status-context';
import { ResourceIdentityFields } from './ResourceIdentityFields';
import { ResourceWorkingHoursEditor } from './ResourceWorkingHoursEditor';
import { useResourceFormSupport } from './use-resource-form-support';
import { useResolvedLocale } from '@/shared/lib/i18n/use-resolved-locale';
import { Card, CardContent } from '@/shared/components/ui/card';
import { FormActionPane } from '@/shared/components/ui/form-action-pane';

export function ResourceCreateForm(): React.JSX.Element {
  const t = useTranslations('dashboard.resourcesPage');
  const tUnits = useTranslations('common.units');
  const dashboardT = useTranslations('dashboard');
  const locale = useResolvedLocale();
  const router = useRouter();
  const createResourceMutation = useCreateResource();
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
  const {
    feedback,
    staffOptions,
    tenantBusinessHours,
    edit,
    handleWorkingHoursChange,
    validateIdentity,
  } = useResourceFormSupport(setWorkingHours);
  const [isSubmittingLocal, setIsSubmittingLocal] = useState(false);

  const isSubmitting = isSubmittingLocal || createResourceMutation.isPending;

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    if (!validateIdentity({ staffRequired: type === 'STAFF', refId, name })) return;
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
              onChange={handleWorkingHoursChange}
              tenantBusinessHours={tenantBusinessHours}
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

            {type !== 'STAFF' && (
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
          submitLabel={t('createSubmit')}
          cancelLabel={t('cancel')}
          cancelHref="/dashboard/resources"
          desktopSaveTestId="resource-create-save-desktop"
          mobileSaveTestId="resource-create-save-mobile"
          isSubmitting={isSubmitting}
          feedback={feedback.feedback}
        />
      </div>
    </form>
  );
}
