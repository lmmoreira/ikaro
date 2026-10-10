'use client';

import { useTranslations } from 'next-intl';
import type { HotsiteServiceResponse } from '@ikaro/types';
import { PillSelect } from '@/shared/components/ui/pill-select';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/components/ui/select';
import { formatDuration } from '@/shared/lib/formatting/format-duration';
import type { useRecurringResourceOptions } from '../../hooks/useRecurringResourceOptions';

interface ServiceFieldProps {
  readonly services: readonly HotsiteServiceResponse[];
  readonly serviceId: string;
  readonly onChange: (serviceId: string) => void;
}

/**
 * The service select. The public service shape does not say whether a service needs approval, so
 * the label cannot either; the customer learns it from the outcome ("em análise").
 */
export function ServiceField({
  services,
  serviceId,
  onChange,
}: ServiceFieldProps): React.JSX.Element {
  const tn = useTranslations('customer.recurringSchedules.new');
  const label = (service: HotsiteServiceResponse): string =>
    tn('serviceOption', {
      name: service.name,
      duration: formatDuration(service.durationMinutes),
      price: service.price.formatted,
    });

  return (
    <div>
      <p id="new-schedule-service-label" className="mb-1 block text-sm font-semibold text-gray-900">
        {tn('fieldService')}
      </p>
      <Select value={serviceId} onValueChange={onChange}>
        <SelectTrigger
          aria-labelledby="new-schedule-service-label"
          data-testid="new-schedule-service"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {services.map((service) => (
            <SelectItem key={service.id} value={service.id}>
              {label(service)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="mt-1 text-xs text-gray-500">{tn('serviceHint')}</p>
    </div>
  );
}

interface ResourceFieldProps {
  readonly query: ReturnType<typeof useRecurringResourceOptions>;
  readonly resourceId: string | null;
  readonly required: boolean;
  readonly onChange: (resourceId: string) => void;
}

/** The resource a `CUSTOMER_CHOICE` service holds every week — one pill per option, first preselected. */
export function ResourceField({
  query,
  resourceId,
  required,
  onChange,
}: ResourceFieldProps): React.JSX.Element {
  const tn = useTranslations('customer.recurringSchedules.new');
  const resources = query.data ?? [];

  function renderChoice(): React.JSX.Element {
    if (query.isError) {
      return (
        <p role="alert" className="text-sm text-red-600">
          {tn('resourcesError')}
        </p>
      );
    }
    if (query.isPending) return <p className="text-sm text-gray-500">{tn('resourcesLoading')}</p>;
    return (
      <PillSelect
        label={tn('fieldResource')}
        value={resourceId ?? ''}
        options={resources.map((resource) => ({
          value: resource.resourceId,
          label: resource.name,
        }))}
        onChange={onChange}
        testId="new-schedule-resource-option"
      />
    );
  }

  return (
    <div data-testid="new-schedule-resource">
      {renderChoice()}
      {required && (
        <p role="alert" className="mt-1 text-xs text-red-600">
          {tn('errorResourceRequired')}
        </p>
      )}
      <p className="mt-1 text-xs text-gray-500">{tn('resourceHint')}</p>
    </div>
  );
}
