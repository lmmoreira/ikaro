'use client';

import { useTranslations } from 'next-intl';
import type { ResourceRequirementItem, ResourceResponse, ResourceType } from '@ikaro/types';
import { countQuantityCandidates } from './resource-requirement-quantity';

// Shared by ServiceResourceRequirementsPanel (flat/bundle mode) and ServiceLegsPanel (per leg,
// scoped by leg index) — one resource-type row: checkbox → quantity → eligible-pool chips → a
// 3-way "who picks" radio (NONE/CUSTOMER_CHOICE/AUTO). Uniform across every ResourceType
// (decided at /story-discovery, 2026-09-18 — neither docs/02-DOMAIN_MODEL.md nor UC-050 scope
// selectionMode by resource type, unlike the prototype's Profissional-only CUSTOMER_CHOICE
// mockup).
//
// AUTO_ANY vs. AUTO_FUNGIBLE_POOL is never asked directly — docs/27-BUSINESS_LOGIC_REFERENCE.md
// confirms it's a UX signal tied to requiredQuantity, not independent resolution logic, so it's
// derived on save: requiredQuantity === 1 → AUTO_ANY, > 1 → AUTO_FUNGIBLE_POOL.

const TYPE_LABEL_KEYS: Record<ResourceType, string> = {
  LOCATION: 'resourceTypeLocation',
  STAFF: 'resourceTypeStaff',
  ROOM: 'resourceTypeRoom',
  EQUIPMENT: 'resourceTypeEquipment',
};

interface ServiceResourceTypeFieldsProps {
  readonly type: ResourceType;
  readonly checked: boolean;
  readonly requirement: ResourceRequirementItem | null;
  readonly availableResources: readonly ResourceResponse[];
  readonly radioGroupName: string;
  // Disambiguates repeated instances of this component (the flat checklist vs. each leg) for
  // both the `id`/`htmlFor` pairing below and the data-scope query attribute — data-testid itself
  // must stay a static string (E2E-3, docs/08-TESTING_STRATEGY.md § Never encode data into
  // data-testid).
  readonly scope: string;
  readonly onToggle: (checked: boolean) => void;
  readonly onChange: (next: ResourceRequirementItem) => void;
}

function deriveAutoSelectionMode(
  requiredQuantity: number,
): ResourceRequirementItem['selectionMode'] {
  return requiredQuantity > 1 ? 'AUTO_FUNGIBLE_POOL' : 'AUTO_ANY';
}

// The 3 real choices a manager picks from — AUTO_ANY/AUTO_FUNGIBLE_POOL collapse into one radio
// (derived from requiredQuantity, docs/27-BUSINESS_LOGIC_REFERENCE.md), but NONE is its own
// distinct, selectable choice (UC-050 step 2, story-discovery 2026-09-18: "all 4 selectionMode
// options... are offered uniformly for every resource type") — not a fallback/default value.
type SelectionModeChoice = 'NONE' | 'CUSTOMER_CHOICE' | 'AUTO';

function toSelectionModeChoice(
  selectionMode: ResourceRequirementItem['selectionMode'] | undefined,
): SelectionModeChoice {
  if (selectionMode === 'NONE') return 'NONE';
  if (selectionMode === 'CUSTOMER_CHOICE') return 'CUSTOMER_CHOICE';
  return 'AUTO';
}

export function ServiceResourceTypeFields({
  type,
  checked,
  requirement,
  availableResources,
  radioGroupName,
  scope,
  onToggle,
  onChange,
}: ServiceResourceTypeFieldsProps): React.JSX.Element {
  const t = useTranslations('dashboard.servicesPage');
  const checkboxId = `${scope}-${type}-checkbox`;
  const quantityId = `${scope}-${type}-quantity`;
  const addEligibleId = `${scope}-${type}-add-eligible`;
  const requiredQuantity = requirement?.requiredQuantity ?? 1;
  const poolIds = requirement?.resourcePoolIds ?? null;
  const eligible = poolIds
    ? availableResources.filter((resource) => poolIds.includes(resource.id))
    : [];
  // Re-derived from `eligible` (never the raw `poolIds`) so a resource that went inactive since
  // this requirement was last saved is silently dropped on the very next edit, instead of
  // resurfacing as an opaque "pool-id-not-active" 422 on save (CodeRabbit round-1 finding).
  const activeEligibleIds = poolIds ? eligible.map((resource) => resource.id) : null;
  const addableResources = availableResources.filter(
    (resource) => !eligible.some((item) => item.id === resource.id),
  );
  const selectionModeChoice = toSelectionModeChoice(requirement?.selectionMode);
  const candidateCount = requirement
    ? countQuantityCandidates(requirement, availableResources)
    : availableResources.length;
  const quantityExceedsCandidates = requiredQuantity > candidateCount;

  function updateRequirement(patch: Partial<ResourceRequirementItem>): void {
    onChange({
      type,
      selectionMode: requirement?.selectionMode ?? 'AUTO_ANY',
      resourcePoolIds: activeEligibleIds,
      requiredQuantity,
      ...patch,
    });
  }

  function selectMode(choice: SelectionModeChoice): void {
    const selectionMode = choice === 'AUTO' ? deriveAutoSelectionMode(requiredQuantity) : choice;
    updateRequirement({ selectionMode });
  }

  return (
    <div
      className="rounded-2xl border border-slate-200 p-4"
      data-testid="resource-type-fields"
      data-scope={scope}
      data-resource-type={type}
    >
      <div className="flex items-start gap-3">
        <input
          id={checkboxId}
          type="checkbox"
          data-testid="resource-type-checkbox"
          data-scope={scope}
          data-resource-type={type}
          checked={checked}
          onChange={(event) => onToggle(event.target.checked)}
          className="mt-0.5 h-4 w-4 rounded border-gray-300"
        />
        <label htmlFor={checkboxId} className="flex-1 cursor-pointer">
          <div className="text-sm font-semibold text-gray-900">{t(TYPE_LABEL_KEYS[type])}</div>
        </label>
      </div>

      {checked && (
        <div className="mt-3 space-y-3 border-t border-slate-100 pt-3">
          <div>
            <label
              htmlFor={quantityId}
              className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500"
            >
              {t('resourceQuantityLabel')}
            </label>
            <input
              id={quantityId}
              type="number"
              min={1}
              data-testid="resource-type-quantity"
              value={requiredQuantity}
              onChange={(event) => {
                const nextQuantity = Math.max(1, Number(event.target.value) || 1);
                updateRequirement(
                  selectionModeChoice === 'AUTO'
                    ? {
                        requiredQuantity: nextQuantity,
                        selectionMode: deriveAutoSelectionMode(nextQuantity),
                      }
                    : { requiredQuantity: nextQuantity },
                );
              }}
              aria-invalid={quantityExceedsCandidates}
              aria-describedby={quantityExceedsCandidates ? `${quantityId}-error` : undefined}
              className="w-24 rounded-md border border-gray-200 bg-white px-3 py-1.5 text-sm outline-none focus:border-blue-500"
            />
            {quantityExceedsCandidates && (
              <p
                id={`${quantityId}-error`}
                role="alert"
                data-testid="resource-type-quantity-error"
                className="mt-1 text-xs text-red-600"
              >
                {t('resourceQuantityExceedsCandidates', {
                  quantity: requiredQuantity,
                  count: candidateCount,
                })}
              </p>
            )}
          </div>

          <div>
            <label
              htmlFor={addEligibleId}
              className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500"
            >
              {t('resourceEligibleLabel', { count: eligible.length })}
            </label>
            <div className="flex flex-wrap gap-1.5" data-testid="resource-type-eligible-chips">
              {eligible.map((resource) => (
                <span
                  key={resource.id}
                  className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs text-gray-700"
                >
                  {resource.name}
                  <button
                    type="button"
                    aria-label={t('resourceRemoveEligible', { name: resource.name })}
                    onClick={() =>
                      updateRequirement({
                        resourcePoolIds: (poolIds ?? []).filter((id) => id !== resource.id),
                      })
                    }
                    className="text-gray-400 hover:text-gray-700"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
            <select
              id={addEligibleId}
              data-testid="resource-type-add-eligible"
              value=""
              onChange={(event) => {
                const nextId = event.target.value;
                if (!nextId) return;
                updateRequirement({ resourcePoolIds: [...(poolIds ?? []), nextId] });
              }}
              disabled={addableResources.length === 0}
              className="mt-1.5 w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <option value="">{t('resourceAddEligiblePlaceholder')}</option>
              {addableResources.map((resource) => (
                <option key={resource.id} value={resource.id}>
                  {resource.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">
              {t('resourceSelectionModeLabel')}
            </label>
            <div className="space-y-1.5 text-sm">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name={radioGroupName}
                  data-testid="resource-selection-mode-none"
                  checked={selectionModeChoice === 'NONE'}
                  onChange={() => selectMode('NONE')}
                />
                {t('resourceSelectionModeNone')}
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name={radioGroupName}
                  data-testid="resource-selection-mode-customer-choice"
                  checked={selectionModeChoice === 'CUSTOMER_CHOICE'}
                  onChange={() => selectMode('CUSTOMER_CHOICE')}
                />
                {t('resourceSelectionModeCustomerChoice')}
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name={radioGroupName}
                  data-testid="resource-selection-mode-auto"
                  checked={selectionModeChoice === 'AUTO'}
                  onChange={() => selectMode('AUTO')}
                />
                {t('resourceSelectionModeAuto')}
              </label>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
