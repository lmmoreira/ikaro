'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import type { ResourceRequirementItem, ResourceType, ServiceLegItem } from '@ikaro/types';
import { useResources } from '@/features/booking/hooks/useResources';
import {
  useUpdateService,
  useUpdateServiceLegs,
  useUpdateServiceResourceRequirements,
} from '@/features/booking/services/useServices';
import { useResolvedLocale } from '@/shared/lib/i18n/use-resolved-locale';
import { resolveErrorMessageFromApiError } from '@/shared/lib/i18n/resolve-error-message';
import { Card, CardContent } from '@/shared/components/ui/card';
import { Button } from '@/shared/components/ui/button';
import { ServiceResourceTypeFields } from './ServiceResourceTypeFields';
import { ServiceLegsPanel } from './ServiceLegsPanel';
import { ServiceBufferAfterMinutesField } from './ServiceBufferAfterMinutesField';

const FLAT_TYPES: ResourceType[] = ['STAFF', 'ROOM', 'EQUIPMENT'];

interface ServiceResourceRequirementsPanelProps {
  readonly serviceId: string;
  readonly initialResourceRequirements: ResourceRequirementItem[];
  readonly initialLegs: ServiceLegItem[] | null;
  readonly initialBufferAfterMinutes: number | null;
  readonly onDirtyChange: (dirty: boolean) => void;
}

export function ServiceResourceRequirementsPanel({
  serviceId,
  initialResourceRequirements,
  initialLegs,
  initialBufferAfterMinutes,
  onDirtyChange,
}: ServiceResourceRequirementsPanelProps): React.JSX.Element {
  const t = useTranslations('dashboard.servicesPage');
  const locale = useResolvedLocale();
  const { data: resourcesData } = useResources({ isActive: true });
  const updateResourceRequirements = useUpdateServiceResourceRequirements();
  const updateLegs = useUpdateServiceLegs();
  const updateService = useUpdateService();

  const [mode, setMode] = useState<'flat' | 'legs'>(initialLegs ? 'legs' : 'flat');
  const [requirements, setRequirements] = useState(initialResourceRequirements);
  const [legs, setLegs] = useState<ServiceLegItem[]>(initialLegs ?? []);
  const [bufferAfterMinutes, setBufferAfterMinutes] = useState(
    initialBufferAfterMinutes !== null ? String(initialBufferAfterMinutes) : '',
  );
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedMessageVisible, setSavedMessageVisible] = useState(false);

  function markDirty(): void {
    if (!dirty) {
      setDirty(true);
      onDirtyChange(true);
    }
    setSavedMessageVisible(false);
  }

  function handleSelectMode(nextMode: 'flat' | 'legs'): void {
    if (nextMode === mode) return;
    setMode(nextMode);
    markDirty();
  }

  function handleToggleType(type: ResourceType, checked: boolean): void {
    setRequirements((current) => {
      if (!checked) return current.filter((item) => item.type !== type);
      return [
        ...current,
        { type, selectionMode: 'AUTO_ANY', resourcePoolIds: null, requiredQuantity: 1 },
      ];
    });
    markDirty();
  }

  function handleChangeType(next: ResourceRequirementItem): void {
    setRequirements((current) => current.map((item) => (item.type === next.type ? next : item)));
    markDirty();
  }

  async function handleSave(): Promise<void> {
    setError(null);
    try {
      if (mode === 'legs') {
        await updateLegs.mutateAsync({ id: serviceId, body: { legs } });
      } else {
        await updateResourceRequirements.mutateAsync({
          id: serviceId,
          body: { resourceRequirements: requirements },
        });
        // An emptied buffer input means "no buffer" (0), not "leave the previous value
        // unchanged" — always send it so a manager can actually clear a previously-set override
        // (CodeRabbit finding: a blank input used to silently skip the PATCH entirely).
        const parsedBuffer = bufferAfterMinutes === '' ? 0 : Number(bufferAfterMinutes);
        if (!Number.isNaN(parsedBuffer)) {
          await updateService.mutateAsync({
            id: serviceId,
            body: { bufferAfterMinutes: parsedBuffer },
          });
        }
      }
      setDirty(false);
      onDirtyChange(false);
      setSavedMessageVisible(true);
    } catch (err) {
      setError(resolveErrorMessageFromApiError(err, locale));
    }
  }

  const isSaving =
    updateResourceRequirements.isPending || updateLegs.isPending || updateService.isPending;
  // Mirrors ServiceLegsPanel's own inline min-2-legs hint — block the save itself, not just show
  // the hint, so a legs-mode save with 0/1 legs can't reach the backend's own 422 for this
  // (CodeRabbit finding).
  const canSave = !isSaving && !(mode === 'legs' && legs.length < 2);
  // Service.setResourceRequirements() rejects (409) whenever the aggregate's own persisted
  // `legs` is non-null — legged→flat is deliberately not a supported transition via this
  // endpoint (service.aggregate.ts's own comment). Once a service was loaded with legs, the flat
  // option can never actually save, so it stays locked rather than producing a confusing 409
  // (CodeRabbit finding).
  const legsLockedOnServer = initialLegs !== null;
  const availableByType = (type: ResourceType) =>
    (resourcesData?.items ?? []).filter((resource) => resource.type === type);

  return (
    <div className="space-y-5">
      <div>
        <label className="mb-2 block text-sm font-semibold text-gray-900">
          {t('recursosModeLabel')}
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            data-testid="resource-mode-flat"
            aria-pressed={mode === 'flat'}
            onClick={() => handleSelectMode('flat')}
            disabled={legsLockedOnServer}
            className={`rounded-2xl border p-4 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
              mode === 'flat' ? 'border-blue-500 bg-blue-50' : 'border-slate-200 hover:bg-slate-50'
            }`}
          >
            <p className="text-sm font-semibold text-gray-900">{t('recursosModeFlatTitle')}</p>
            <p className="mt-0.5 text-xs text-gray-500">
              {legsLockedOnServer ? t('recursosModeFlatLockedHint') : t('recursosModeFlatSub')}
            </p>
          </button>
          <button
            type="button"
            data-testid="resource-mode-legs"
            aria-pressed={mode === 'legs'}
            onClick={() => handleSelectMode('legs')}
            className={`rounded-2xl border p-4 text-left transition-colors ${
              mode === 'legs' ? 'border-blue-500 bg-blue-50' : 'border-slate-200 hover:bg-slate-50'
            }`}
          >
            <p className="text-sm font-semibold text-gray-900">{t('recursosModeLegsTitle')}</p>
            <p className="mt-0.5 text-xs text-gray-500">{t('recursosModeLegsSub')}</p>
          </button>
        </div>
      </div>

      {mode === 'flat' ? (
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
                <p className="text-sm font-semibold text-gray-900">
                  {t('recursosEmptyStateTitle')}
                </p>
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
                onToggle={(checked) => handleToggleType(type, checked)}
                onChange={handleChangeType}
              />
            ))}
          </CardContent>
        </Card>
      ) : (
        <ServiceLegsPanel
          legs={legs}
          availableResourcesByType={availableByType}
          onChange={(next) => {
            setLegs(next);
            markDirty();
          }}
        />
      )}

      <ServiceBufferAfterMinutesField
        value={bufferAfterMinutes}
        disabled={mode === 'legs'}
        onChange={(value) => {
          setBufferAfterMinutes(value);
          markDirty();
        }}
      />

      {error && (
        <div
          role="alert"
          data-testid="resource-requirements-error"
          className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {error}
        </div>
      )}

      <div className="flex items-center gap-3">
        <Button
          type="button"
          data-testid="resource-requirements-save"
          onClick={handleSave}
          disabled={!canSave}
        >
          {t('recursosSaveButton')}
        </Button>
        {savedMessageVisible && (
          <span data-testid="resource-requirements-saved" className="text-sm text-green-600">
            {t('recursosSavedConfirm')}
          </span>
        )}
      </div>
    </div>
  );
}
