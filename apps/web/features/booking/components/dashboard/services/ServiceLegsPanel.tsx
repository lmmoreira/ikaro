'use client';

import { useTranslations } from 'next-intl';
import type {
  ResourceRequirementItem,
  ResourceResponse,
  ResourceType,
  ServiceLegItem,
} from '@ikaro/types';
import { Card, CardContent } from '@/shared/components/ui/card';
import { Button } from '@/shared/components/ui/button';
import { ServiceResourceTypeFields } from './ServiceResourceTypeFields';

const LEG_TYPES: ResourceType[] = ['STAFF', 'ROOM', 'EQUIPMENT'];

function emptyLeg(legIndex: number): ServiceLegItem {
  return {
    legIndex,
    name: '',
    durationMinutes: 30,
    resourceRequirements: [],
    transitionGapAfterMinutes: 0,
  };
}

function renumber(legs: ServiceLegItem[]): ServiceLegItem[] {
  return legs.map((leg, index) => ({ ...leg, legIndex: index }));
}

interface ServiceLegsPanelProps {
  readonly legs: ServiceLegItem[];
  readonly availableResourcesByType: (type: ResourceType) => readonly ResourceResponse[];
  readonly onChange: (legs: ServiceLegItem[]) => void;
}

// Recursos tab, legs mode — reuses ServiceResourceTypeFields per leg per type (dev-notes.md §
// "Legs-mode resource picker rebuilt as a real control"), not a bespoke read-only rendering.
export function ServiceLegsPanel({
  legs,
  availableResourcesByType,
  onChange,
}: ServiceLegsPanelProps): React.JSX.Element {
  const t = useTranslations('dashboard.servicesPage');
  const totalSpanMinutes = legs.reduce(
    (sum, leg) => sum + leg.durationMinutes + (leg.transitionGapAfterMinutes ?? 0),
    0,
  );

  function updateLeg(legIndex: number, patch: Partial<ServiceLegItem>): void {
    onChange(legs.map((leg) => (leg.legIndex === legIndex ? { ...leg, ...patch } : leg)));
  }

  function addLeg(): void {
    onChange([...legs, emptyLeg(legs.length)]);
  }

  function removeLeg(legIndex: number): void {
    onChange(renumber(legs.filter((leg) => leg.legIndex !== legIndex)));
  }

  function toggleLegType(legIndex: number, type: ResourceType, checked: boolean): void {
    const leg = legs.find((item) => item.legIndex === legIndex);
    if (!leg) return;
    const nextRequirements = checked
      ? [
          ...leg.resourceRequirements,
          { type, selectionMode: 'AUTO_ANY' as const, resourcePoolIds: null, requiredQuantity: 1 },
        ]
      : leg.resourceRequirements.filter((item) => item.type !== type);
    updateLeg(legIndex, { resourceRequirements: nextRequirements });
  }

  function changeLegRequirement(legIndex: number, next: ResourceRequirementItem): void {
    const leg = legs.find((item) => item.legIndex === legIndex);
    if (!leg) return;
    updateLeg(legIndex, {
      resourceRequirements: leg.resourceRequirements.map((item) =>
        item.type === next.type ? next : item,
      ),
    });
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-1 p-5">
          <p className="text-sm font-semibold text-gray-900">{t('legsIntroTitle')}</p>
          <p className="text-sm text-gray-500">{t('legsIntroDescription')}</p>
        </CardContent>
      </Card>

      {legs.map((leg) => (
        <Card key={leg.legIndex} data-testid="leg-card" data-leg-index={leg.legIndex}>
          <CardContent className="space-y-3 p-5">
            <div className="flex items-center justify-between">
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-slate-900 text-xs font-bold text-white">
                {leg.legIndex + 1}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                data-testid="leg-remove"
                data-leg-index={leg.legIndex}
                onClick={() => removeLeg(leg.legIndex)}
              >
                {t('legsRemoveButton')}
              </Button>
            </div>

            <div>
              <label
                htmlFor={`leg-${leg.legIndex}-name`}
                className="mb-1 block text-sm font-semibold text-gray-900"
              >
                {t('legNameLabel')}
              </label>
              <input
                id={`leg-${leg.legIndex}-name`}
                data-testid="leg-name"
                data-leg-index={leg.legIndex}
                value={leg.name}
                onChange={(event) => updateLeg(leg.legIndex, { name: event.target.value })}
                className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor={`leg-${leg.legIndex}-duration`}
                  className="mb-1 block text-sm font-semibold text-gray-900"
                >
                  {t('legDurationLabel')}
                </label>
                <input
                  id={`leg-${leg.legIndex}-duration`}
                  type="number"
                  min={1}
                  data-testid="leg-duration"
                  data-leg-index={leg.legIndex}
                  value={leg.durationMinutes}
                  onChange={(event) =>
                    updateLeg(leg.legIndex, {
                      durationMinutes: Math.max(1, Number(event.target.value) || 1),
                    })
                  }
                  className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label
                  htmlFor={`leg-${leg.legIndex}-transition-gap`}
                  className="mb-1 block text-sm font-semibold text-gray-900"
                >
                  {t('legTransitionGapLabel')}
                </label>
                <input
                  id={`leg-${leg.legIndex}-transition-gap`}
                  type="number"
                  min={0}
                  data-testid="leg-transition-gap"
                  data-leg-index={leg.legIndex}
                  value={leg.transitionGapAfterMinutes ?? 0}
                  onChange={(event) =>
                    updateLeg(leg.legIndex, {
                      transitionGapAfterMinutes: Math.max(0, Number(event.target.value) || 0),
                    })
                  }
                  className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-semibold text-gray-900">
                {t('legsResourceRequirementLabel')}
              </label>
              {LEG_TYPES.map((type) => (
                <ServiceResourceTypeFields
                  key={type}
                  type={type}
                  checked={leg.resourceRequirements.some((item) => item.type === type)}
                  requirement={leg.resourceRequirements.find((item) => item.type === type) ?? null}
                  availableResources={availableResourcesByType(type)}
                  radioGroupName={`selmode-leg${leg.legIndex}-${type}`}
                  scope={`leg-${leg.legIndex}`}
                  onToggle={(checked) => toggleLegType(leg.legIndex, type, checked)}
                  onChange={(next) => changeLegRequirement(leg.legIndex, next)}
                />
              ))}
            </div>
          </CardContent>
        </Card>
      ))}

      <Button type="button" variant="outline" data-testid="legs-add-button" onClick={addLeg}>
        {t('legsAddButton')}
      </Button>

      <p data-testid="legs-total-span" className="text-sm font-semibold text-gray-900">
        {t('legsTotalSpanLabel')}: {totalSpanMinutes} min
      </p>
      {legs.length > 0 && legs.length < 2 && (
        <p data-testid="legs-min-required-error" className="text-sm text-red-600">
          {t('legsMinRequiredError')}
        </p>
      )}
    </div>
  );
}
