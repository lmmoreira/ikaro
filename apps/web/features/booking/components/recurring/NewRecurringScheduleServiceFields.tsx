'use client';

import { useTranslations } from 'next-intl';
import type { HotsiteServiceResourceOption, HotsiteServiceResponse } from '@ikaro/types';
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
  const tn = useTranslations('booking.recurringScheduleForm');
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
  /** Only the loading and error state of the shared options request. */
  readonly query: Pick<ReturnType<typeof useRecurringResourceOptions>, 'isError' | 'isPending'>;
  readonly title: string;
  /** The options of this one requirement. */
  readonly options: readonly HotsiteServiceResourceOption[];
  readonly resourceId: string | null;
  readonly required: boolean;
  readonly requiredMessage: string;
  readonly noOptionsMessage: string;
  /** Distinguishes the groups of a bundle in test ids. */
  readonly index?: number;
  readonly onChange: (resourceId: string) => void;
}

/**
 * The resource a `CUSTOMER_CHOICE` requirement holds every week — one pill per option, first
 * preselected. A bundle renders one of these per requirement; a group that is loading, failed or
 * has no options says so without touching the others.
 */
export function ResourceField({
  query,
  title,
  options,
  resourceId,
  required,
  requiredMessage,
  noOptionsMessage,
  index = 0,
  onChange,
}: ResourceFieldProps): React.JSX.Element {
  const tn = useTranslations('booking.recurringScheduleForm');

  function renderChoice(): React.JSX.Element {
    if (query.isError) {
      return (
        <p role="alert" className="text-sm text-red-600">
          {tn('resourcesError')}
        </p>
      );
    }
    if (query.isPending) return <p className="text-sm text-gray-500">{tn('resourcesLoading')}</p>;
    if (options.length === 0) {
      return (
        <p role="alert" data-testid="new-schedule-resource-empty" className="text-sm text-red-600">
          {noOptionsMessage}
        </p>
      );
    }
    return (
      <PillSelect
        label={title}
        value={resourceId ?? ''}
        options={options.map((resource) => ({ value: resource.resourceId, label: resource.name }))}
        onChange={onChange}
        testId="new-schedule-resource-option"
      />
    );
  }

  return (
    <div data-testid="new-schedule-resource" data-index={index}>
      {renderChoice()}
      {required && (
        <p role="alert" className="mt-1 text-xs text-red-600">
          {requiredMessage}
        </p>
      )}
      <p className="mt-1 text-xs text-gray-500">{tn('resourceHint')}</p>
    </div>
  );
}

interface AutoResourceLineProps {
  readonly title: string;
  readonly text: string;
}

/** A requirement the system resolves every week: nothing to choose, so a read-only line. */
export function AutoResourceLine({ title, text }: AutoResourceLineProps): React.JSX.Element {
  return (
    <div data-testid="new-schedule-resource-auto">
      <p className="mb-1 block text-sm font-semibold text-gray-900">{title}</p>
      <p className="rounded-lg border border-dashed border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700">
        {text}
      </p>
    </div>
  );
}
