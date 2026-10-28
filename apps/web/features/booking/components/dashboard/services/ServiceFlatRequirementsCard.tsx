'use client';

import { useTranslations } from 'next-intl';
import type { ResourceRequirementItem, ResourceResponse, ResourceType } from '@ikaro/types';
import { Card, CardContent } from '@/shared/components/ui/card';
import { ServiceResourceTypeFields } from './ServiceResourceTypeFields';

const FLAT_TYPES: ResourceType[] = ['STAFF', 'ROOM', 'EQUIPMENT'];

interface ServiceFlatRequirementsCardProps {
  readonly requirements: ResourceRequirementItem[];
  readonly availableByType: (type: ResourceType) => ResourceResponse[];
  readonly eligibilityReady: boolean;
  readonly onToggleType: (type: ResourceType, checked: boolean) => void;
  readonly onChangeType: (next: ResourceRequirementItem) => void;
}

// Split out of ServiceResourceRequirementsPanel to stay under docs/CODE_STANDARDS.md's
// function-length limit. No box checked is a valid, saveable state: a resource-free service.
export function ServiceFlatRequirementsCard({
  requirements,
  availableByType,
  eligibilityReady,
  onToggleType,
  onChangeType,
}: ServiceFlatRequirementsCardProps): React.JSX.Element {
  const t = useTranslations('dashboard.servicesPage');

  return (
    <Card>
      <CardContent className="space-y-3 p-5">
        <label className="block text-sm font-semibold text-gray-900">
          {t('recursosChecklistLabel')}
        </label>

        {requirements.length === 0 && (
          <div
            data-testid="resource-empty-state"
            className="rounded-2xl border border-dashed border-slate-300 p-5 text-center"
          >
            <p className="text-sm font-semibold text-gray-900">{t('recursosEmptyStateTitle')}</p>
            <p className="mt-1 text-sm text-gray-500">{t('recursosEmptyStateDescription')}</p>
          </div>
        )}

        {FLAT_TYPES.map((type) => (
          <ServiceResourceTypeFields
            key={type}
            type={type}
            checked={requirements.some((item) => item.type === type)}
            requirement={requirements.find((item) => item.type === type) ?? null}
            availableResources={availableByType(type)}
            radioGroupName={`selmode-flat-${type}`}
            scope="flat"
            eligibilityReady={eligibilityReady}
            onToggle={(checked) => onToggleType(type, checked)}
            onChange={onChangeType}
          />
        ))}
      </CardContent>
    </Card>
  );
}
