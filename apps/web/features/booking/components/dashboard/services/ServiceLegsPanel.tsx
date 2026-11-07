'use client';

import { Input } from '@/shared/components/ui/input';
import { Label } from '@/shared/components/ui/label';
import { useTranslations } from 'next-intl';
import type {
  ResourceRequirementItem,
  ResourceResponse,
  ResourceType,
  ServiceLegItem,
} from '@ikaro/types';
import { Card, CardContent } from '@/shared/components/ui/card';
import { Button } from '@/shared/components/ui/button';
import { FieldFeedback } from '@/shared/components/ui/field-feedback';
import { legsSpanMinutes } from './legs-span';
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
  readonly eligibilityReady?: boolean;
  readonly onChange: (legs: ServiceLegItem[]) => void;
}

// Recursos tab, legs mode — reuses ServiceResourceTypeFields per leg per type (dev-notes.md §
// "Legs-mode resource picker rebuilt as a real control"), not a bespoke read-only rendering.
export function ServiceLegsPanel({
  legs,
  availableResourcesByType,
  eligibilityReady = true,
  onChange,
}: ServiceLegsPanelProps): React.JSX.Element {
  const t = useTranslations('dashboard.servicesPage');
  const totalSpanMinutes = legsSpanMinutes(legs);
  // The "Add leg" button is the control that fixes this, so it is the one the message describes.
  const minLegsMissing = legs.length > 0 && legs.length < 2;

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
              <Label htmlFor={`leg-${leg.legIndex}-name`} className="mb-1">
                {t('legNameLabel')}
              </Label>
              <Input
                id={`leg-${leg.legIndex}-name`}
                data-testid="leg-name"
                data-leg-index={leg.legIndex}
                value={leg.name}
                onChange={(event) => updateLeg(leg.legIndex, { name: event.target.value })}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor={`leg-${leg.legIndex}-duration`} className="mb-1">
                  {t('legDurationLabel')}
                </Label>
                <Input
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
                />
              </div>
              <div>
                <Label htmlFor={`leg-${leg.legIndex}-transition-gap`} className="mb-1">
                  {t('legTransitionGapLabel')}
                </Label>
                <Input
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
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="mb-0">{t('legsResourceRequirementLabel')}</Label>
              {LEG_TYPES.map((type) => (
                <ServiceResourceTypeFields
                  key={type}
                  type={type}
                  checked={leg.resourceRequirements.some((item) => item.type === type)}
                  requirement={leg.resourceRequirements.find((item) => item.type === type) ?? null}
                  availableResources={availableResourcesByType(type)}
                  radioGroupName={`selmode-leg${leg.legIndex}-${type}`}
                  scope={`leg-${leg.legIndex}`}
                  eligibilityReady={eligibilityReady}
                  onToggle={(checked) => toggleLegType(leg.legIndex, type, checked)}
                  onChange={(next) => changeLegRequirement(leg.legIndex, next)}
                />
              ))}
            </div>
          </CardContent>
        </Card>
      ))}

      <Button
        type="button"
        variant="outline"
        data-testid="legs-add-button"
        aria-describedby={minLegsMissing ? 'legs-min-required-error' : undefined}
        onClick={addLeg}
      >
        {t('legsAddButton')}
      </Button>

      <p data-testid="legs-total-span" className="text-sm font-semibold text-gray-900">
        {t('legsTotalSpanLabel')}: {totalSpanMinutes} min
      </p>
      {minLegsMissing && (
        <FieldFeedback id="legs-min-required-error" testId="legs-min-required-error">
          {t('legsMinRequiredError')}
        </FieldFeedback>
      )}
    </div>
  );
}
