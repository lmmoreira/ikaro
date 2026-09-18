'use client';

import { useTranslations } from 'next-intl';
import type { ResourceRequirementItem, ResourceResponse, ResourceType } from '@ikaro/types';

// Shared by ServiceResourceRequirementsPanel (flat/bundle mode) and ServiceLegsPanel (per leg,
// scoped by leg index) — one resource-type row: checkbox → quantity → eligible-pool chips → a
// 2-way "who picks" radio. Uniform across every ResourceType (decided at /story-discovery,
// 2026-09-18 — neither docs/02-DOMAIN_MODEL.md nor UC-050 scope selectionMode by resource type,
// unlike the prototype's Profissional-only CUSTOMER_CHOICE mockup).
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

function deriveSelectionMode(
  wantsCustomerChoice: boolean,
  requiredQuantity: number,
): ResourceRequirementItem['selectionMode'] {
  if (wantsCustomerChoice) return 'CUSTOMER_CHOICE';
  return requiredQuantity > 1 ? 'AUTO_FUNGIBLE_POOL' : 'AUTO_ANY';
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
  const requiredQuantity = requirement?.requiredQuantity ?? 1;
  const poolIds = requirement?.resourcePoolIds ?? null;
  const eligible = poolIds
    ? availableResources.filter((resource) => poolIds.includes(resource.id))
    : [];
  const addableResources = availableResources.filter(
    (resource) => !eligible.some((item) => item.id === resource.id),
  );
  const isCustomerChoice = requirement?.selectionMode === 'CUSTOMER_CHOICE';

  function updateRequirement(patch: Partial<ResourceRequirementItem>): void {
    onChange({
      type,
      selectionMode: requirement?.selectionMode ?? 'AUTO_ANY',
      resourcePoolIds: requirement?.resourcePoolIds ?? null,
      requiredQuantity,
      ...patch,
    });
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
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">
              {t('resourceQuantityLabel')}
            </label>
            <input
              type="number"
              min={1}
              data-testid="resource-type-quantity"
              value={requiredQuantity}
              onChange={(event) => {
                const nextQuantity = Math.max(1, Number(event.target.value) || 1);
                updateRequirement({
                  requiredQuantity: nextQuantity,
                  selectionMode: deriveSelectionMode(isCustomerChoice, nextQuantity),
                });
              }}
              className="w-24 rounded-md border border-gray-200 bg-white px-3 py-1.5 text-sm outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
              {t('resourceEligibleLabel', { count: eligible.length })}
            </p>
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
                  checked={isCustomerChoice}
                  onChange={() =>
                    updateRequirement({
                      selectionMode: 'CUSTOMER_CHOICE',
                    })
                  }
                />
                {t('resourceSelectionModeCustomerChoice')}
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name={radioGroupName}
                  checked={!isCustomerChoice}
                  onChange={() =>
                    updateRequirement({
                      selectionMode: deriveSelectionMode(false, requiredQuantity),
                    })
                  }
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
