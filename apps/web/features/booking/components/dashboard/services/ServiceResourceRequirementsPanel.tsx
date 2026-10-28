'use client';

import { useRef, useState } from 'react';
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
import {
  normalizeLegsResourcePoolIds,
  normalizeResourcePoolIds,
} from './resource-pool-normalization';
import { hasUnsatisfiableRequirement } from './resource-requirement-quantity';
import { useRegisterTabAction, type ServiceTabActionChange } from './service-tab-action';
import { bufferToField, fieldToBuffer, isValidBufferField } from './service-buffer-field';
import { ServiceFlatRequirementsCard } from './ServiceFlatRequirementsCard';
import { ServiceLegsPanel } from './ServiceLegsPanel';
import { ServiceBufferAfterMinutesField } from './ServiceBufferAfterMinutesField';
import { ServiceResourceModePicker } from './ServiceResourceModePicker';

interface ServiceResourceRequirementsPanelProps {
  readonly serviceId: string;
  readonly initialResourceRequirements: ResourceRequirementItem[];
  readonly initialLegs: ServiceLegItem[] | null;
  readonly initialBufferAfterMinutes: number | null;
  // The business's current default buffer, what a blank field inherits; null where a buffer does
  // not apply (legged and SESSION services).
  readonly tenantDefaultBufferMinutes: number | null;
  readonly onDirtyChange: (dirty: boolean) => void;
  readonly onActionChange: ServiceTabActionChange;
  // Legs set the service's duration (their span), so the Detalhes tab needs the new value.
  readonly onLegsSaved?: (totalSpanMinutes: number) => void;
  // The flat requirements as saved, for the Políticas tab's recurrence hint (TD49-S03).
  readonly onRequirementsSaved?: (requirements: ResourceRequirementItem[]) => void;
}

export function ServiceResourceRequirementsPanel({
  serviceId,
  initialResourceRequirements,
  initialLegs,
  initialBufferAfterMinutes,
  tenantDefaultBufferMinutes,
  onDirtyChange,
  onActionChange,
  onLegsSaved,
  onRequirementsSaved,
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
  // '' = no override (the service inherits the business default and is saved as null); a number,
  // including '0', is an explicit override.
  const [bufferAfterMinutes, setBufferAfterMinutes] = useState(
    bufferToField(initialBufferAfterMinutes),
  );
  // What each endpoint last accepted, so a save only sends what the manager actually changed — a
  // buffer-only edit never touches the requirements endpoint (a resource-free service holds [],
  // which is exactly what it must not be re-sent), and a retry after a half-failed save resends
  // only the part that did not land.
  const [savedRequirements, setSavedRequirements] = useState(initialResourceRequirements);
  const [savedBuffer, setSavedBuffer] = useState(bufferToField(initialBufferAfterMinutes));
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
  const requirementsChanged = JSON.stringify(requirements) !== JSON.stringify(savedRequirements);
  const bufferChanged = bufferAfterMinutes !== savedBuffer;
  // Only a flat service has a buffer to validate; legs mode disables the field.
  const bufferInvalid = mode === 'flat' && !isValidBufferField(bufferAfterMinutes);

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
        const savedLegs = await updateLegs.mutateAsync({
          id: serviceId,
          body: { legs: normalizeLegsResourcePoolIds(legs, availableResources) },
        });
        setLegsLockedOnServer(true);
        onLegsSaved?.(savedLegs.totalSpanMinutes);
      } else {
        // Two independent mutations, each sent only when its own value changed: requirements
        // first, then the buffer.
        if (requirementsChanged) {
          const saved = await updateResourceRequirements.mutateAsync({
            id: serviceId,
            body: {
              resourceRequirements: requirements.map((requirement) =>
                normalizeResourcePoolIds(requirement, availableResources),
              ),
            },
          });
          setSavedRequirements(requirements);
          onRequirementsSaved?.(saved.resourceRequirements);
        }
        if (bufferChanged) {
          // A blank field clears the override (null = inherit the business default); 0 is a
          // real "no buffer" override.
          await updateService.mutateAsync({
            id: serviceId,
            body: { bufferAfterMinutes: fieldToBuffer(bufferAfterMinutes) },
          });
          setSavedBuffer(bufferAfterMinutes);
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
  const eligibilityReady = !resourcesLoading && !resourcesLoadFailed;
  const availableByType = (type: ResourceType) =>
    (resourcesData?.items ?? []).filter((resource) => resource.type === type);
  // A requirement asking for more distinct resources than it has candidates can never be booked —
  // block the save (the backend 422s the same shape) instead of letting the manager discover it as
  // an empty calendar. Covers flat requirements and every leg's own requirements.
  const activeRequirements =
    mode === 'legs' ? legs.flatMap((leg) => leg.resourceRequirements) : requirements;
  const hasUnsatisfiableQuantity = hasUnsatisfiableRequirement(activeRequirements, availableByType);
  const canSave =
    !isSaving &&
    !resourcesLoading &&
    !resourcesLoadFailed &&
    !(mode === 'legs' && legs.length < 2) &&
    !hasUnsatisfiableQuantity &&
    !bufferInvalid;

  useRegisterTabAction(onActionChange, {
    label: t('recursosSaveButton'),
    disabled: !canSave,
    pending: isSaving,
    onSubmit: handleSave,
  });

  return (
    <div className="space-y-5">
      <ServiceResourceModePicker
        mode={mode}
        legsLockedOnServer={legsLockedOnServer}
        onSelectMode={handleSelectMode}
      />

      {mode === 'flat' ? (
        <ServiceFlatRequirementsCard
          requirements={requirements}
          availableByType={availableByType}
          eligibilityReady={eligibilityReady}
          onToggleType={handleToggleType}
          onChangeType={handleChangeType}
        />
      ) : (
        <ServiceLegsPanel
          legs={legs}
          availableResourcesByType={availableByType}
          eligibilityReady={eligibilityReady}
          onChange={(next) => {
            setLegs(next);
            markDirty();
          }}
        />
      )}

      <ServiceBufferAfterMinutesField
        value={bufferAfterMinutes}
        disabled={mode === 'legs'}
        tenantDefaultMinutes={tenantDefaultBufferMinutes}
        invalid={bufferInvalid}
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
