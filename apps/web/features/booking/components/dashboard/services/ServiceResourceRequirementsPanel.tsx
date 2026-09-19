'use client';

import { useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import type {
  ResourceRequirementItem,
  ResourceResponse,
  ResourceType,
  ServiceLegItem,
} from '@ikaro/types';
import { useResources } from '@/features/booking/hooks/useResources';
import {
  useUpdateService,
  useUpdateServiceLegs,
  useUpdateServiceResourceRequirements,
} from '@/features/booking/services/useServices';
import { useResolvedLocale } from '@/shared/lib/i18n/use-resolved-locale';
import { resolveErrorMessageFromApiError } from '@/shared/lib/i18n/resolve-error-message';
import { Card, CardContent } from '@/shared/components/ui/card';
import { useRegisterTabAction, type ServiceTabActionChange } from './service-tab-action';
import { ServiceResourceTypeFields } from './ServiceResourceTypeFields';
import { ServiceLegsPanel } from './ServiceLegsPanel';
import { ServiceBufferAfterMinutesField } from './ServiceBufferAfterMinutesField';
import { ServiceResourceModePicker } from './ServiceResourceModePicker';

const FLAT_TYPES: ResourceType[] = ['STAFF', 'ROOM', 'EQUIPMENT'];

// Drops any resourcePoolIds entry that isn't among the passed active resources of the matching
// type — applied to every requirement at save time (not only the one a manager just edited), so
// a resource that went inactive since this requirement was last saved can never be silently
// resubmitted via an unrelated edit (e.g. changing a different type, or just the buffer). The
// per-row normalization in ServiceResourceTypeFields only covers the row actually touched.
function normalizeResourcePoolIds(
  requirement: ResourceRequirementItem,
  availableResources: readonly ResourceResponse[],
): ResourceRequirementItem {
  if (!requirement.resourcePoolIds) return requirement;
  const activeIds = new Set(
    availableResources
      .filter((resource) => resource.type === requirement.type)
      .map((resource) => resource.id),
  );
  return {
    ...requirement,
    resourcePoolIds: requirement.resourcePoolIds.filter((id) => activeIds.has(id)),
  };
}

interface ServiceResourceRequirementsPanelProps {
  readonly serviceId: string;
  readonly initialResourceRequirements: ResourceRequirementItem[];
  readonly initialLegs: ServiceLegItem[] | null;
  readonly initialBufferAfterMinutes: number | null;
  readonly onDirtyChange: (dirty: boolean) => void;
  readonly onActionChange: ServiceTabActionChange;
}

export function ServiceResourceRequirementsPanel({
  serviceId,
  initialResourceRequirements,
  initialLegs,
  initialBufferAfterMinutes,
  onDirtyChange,
  onActionChange,
}: ServiceResourceRequirementsPanelProps): React.JSX.Element {
  const t = useTranslations('dashboard.servicesPage');
  const locale = useResolvedLocale();
  const {
    data: resourcesData,
    isLoading: resourcesLoading,
    isError: resourcesLoadFailed,
  } = useResources({ isActive: true });
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
  // Service.setResourceRequirements() rejects (409) whenever the aggregate's own persisted
  // `legs` is non-null — legged→flat is deliberately not a supported transition via this
  // endpoint (service.aggregate.ts's own comment). Tracked as state (not derived from the
  // initialLegs prop alone) so a flat→legs save *within this same page session* locks the flat
  // option immediately, instead of only after a reload re-supplies initialLegs (Codex finding).
  const [legsLockedOnServer, setLegsLockedOnServer] = useState(initialLegs !== null);
  // Bumped on every edit — lets a save in flight tell whether a *newer* edit landed while it was
  // pending, so it never clears dirty for an edit it didn't actually persist (same race fixed for
  // Detalhes/Políticas/Formulário; this panel was missed the first time — Codex finding).
  const editRevisionRef = useRef(0);

  function markDirty(): void {
    editRevisionRef.current += 1;
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
    // useResources() is async — resourcesData is undefined until it resolves. Without this
    // guard, normalizeResourcePoolIds would treat every active resource as inactive on a save
    // that races ahead of the query (or one that lands after it failed), silently dropping every
    // requirement's resourcePoolIds instead of leaving them untouched (Codex finding).
    if (resourcesLoading || resourcesLoadFailed) {
      setError(t('recursosResourcesLoadError'));
      return;
    }
    const availableResources = resourcesData?.items ?? [];
    const revisionAtSubmit = editRevisionRef.current;
    try {
      if (mode === 'legs') {
        await updateLegs.mutateAsync({
          id: serviceId,
          body: {
            legs: legs.map((leg) => ({
              ...leg,
              resourceRequirements: leg.resourceRequirements.map((requirement) =>
                normalizeResourcePoolIds(requirement, availableResources),
              ),
            })),
          },
        });
        setLegsLockedOnServer(true);
      } else {
        await updateResourceRequirements.mutateAsync({
          id: serviceId,
          body: {
            resourceRequirements: requirements.map((requirement) =>
              normalizeResourcePoolIds(requirement, availableResources),
            ),
          },
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
      if (editRevisionRef.current === revisionAtSubmit) {
        setDirty(false);
        onDirtyChange(false);
        setSavedMessageVisible(true);
      }
    } catch (err) {
      setError(resolveErrorMessageFromApiError(err, locale));
    }
  }

  const isSaving =
    updateResourceRequirements.isPending || updateLegs.isPending || updateService.isPending;
  // Mirrors ServiceLegsPanel's own inline min-2-legs hint — block the save itself, not just show
  // the hint, so a legs-mode save with 0/1 legs can't reach the backend's own 422 for this
  // (CodeRabbit finding).
  const canSave =
    !isSaving && !resourcesLoading && !resourcesLoadFailed && !(mode === 'legs' && legs.length < 2);
  useRegisterTabAction(onActionChange, {
    label: t('recursosSaveButton'),
    disabled: !canSave,
    pending: isSaving,
    onSubmit: handleSave,
  });

  const availableByType = (type: ResourceType) =>
    (resourcesData?.items ?? []).filter((resource) => resource.type === type);

  return (
    <div className="space-y-5">
      <ServiceResourceModePicker
        mode={mode}
        legsLockedOnServer={legsLockedOnServer}
        onSelectMode={handleSelectMode}
      />

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

      {savedMessageVisible && (
        <p data-testid="resource-requirements-saved" className="text-sm text-green-600">
          {t('recursosSavedConfirm')}
        </p>
      )}
    </div>
  );
}
