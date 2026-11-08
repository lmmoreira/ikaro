'use client';

import { Label } from '@/shared/components/ui/label';
import { NativeSelect } from '@/shared/components/ui/native-select';
import { useTranslations } from 'next-intl';
import type { ResourceResponse } from '@ikaro/types';
import { Button } from '@/shared/components/ui/button';

interface EligiblePoolPickerProps {
  readonly addEligibleId: string;
  readonly eligible: readonly ResourceResponse[];
  readonly addableResources: readonly ResourceResponse[];
  readonly stalePool: boolean;
  readonly poolIds: readonly string[] | null;
  readonly onChange: (resourcePoolIds: string[]) => void;
}

// The eligible-resources chips + "add" select (+ the stale-pool notice) of one resource-type row.
export function EligiblePoolPicker({
  addEligibleId,
  eligible,
  addableResources,
  stalePool,
  poolIds,
  onChange,
}: EligiblePoolPickerProps): React.JSX.Element {
  const t = useTranslations('dashboard.servicesPage');

  return (
    <div>
      <Label htmlFor={addEligibleId} className="mb-1 text-xs uppercase tracking-wide text-gray-500">
        {t('resourceEligibleLabel', { count: eligible.length })}
      </Label>
      <div className="flex flex-wrap gap-1.5" data-testid="resource-type-eligible-chips">
        {eligible.map((resource) => (
          <span
            key={resource.id}
            className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs text-gray-700"
          >
            {resource.name}
            <Button
              type="button"
              aria-label={t('resourceRemoveEligible', { name: resource.name })}
              onClick={() => onChange((poolIds ?? []).filter((id) => id !== resource.id))}
              variant="link-muted"
              size="inline"
            >
              ×
            </Button>
          </span>
        ))}
      </div>
      <NativeSelect
        id={addEligibleId}
        data-testid="resource-type-add-eligible"
        value=""
        onChange={(event) => {
          const nextId = event.target.value;
          if (!nextId) return;
          onChange([...(poolIds ?? []), nextId]);
        }}
        disabled={addableResources.length === 0}
        aria-describedby={stalePool ? `${addEligibleId}-stale` : undefined}
        wrapperClassName="mt-1.5"
      >
        <option value="">{t('resourceAddEligiblePlaceholder')}</option>
        {addableResources.map((resource) => (
          <option key={resource.id} value={resource.id}>
            {resource.name}
          </option>
        ))}
      </NativeSelect>
      {stalePool && (
        <output
          id={`${addEligibleId}-stale`}
          data-testid="resource-type-stale-pool"
          className="mt-1 block text-xs text-red-600"
        >
          {t('resourceStalePoolNotice')}
        </output>
      )}
    </div>
  );
}
