'use client';

import { useTranslations } from 'next-intl';
import type { ResourceType, StaffListItem } from '@ikaro/types';
import { cn } from '@/shared/utils/cn';

const INPUT_CLASS =
  'w-full rounded-md border border-border bg-white px-3 py-2.5 text-sm text-gray-900 outline-none transition-colors placeholder:text-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 aria-[invalid=true]:border-red-500 aria-[invalid=true]:bg-red-50';

const EDITABLE_TYPES: readonly Exclude<ResourceType, 'LOCATION'>[] = ['STAFF', 'ROOM', 'EQUIPMENT'];

const TYPE_CARD_LABEL_KEY: Record<Exclude<ResourceType, 'LOCATION'>, string> = {
  STAFF: 'typeStaff',
  ROOM: 'typeRoom',
  EQUIPMENT: 'typeEquipment',
};

interface ResourceIdentityFieldsProps {
  readonly showTypePicker: boolean;
  readonly type: Exclude<ResourceType, 'LOCATION'>;
  readonly onTypeChange: (type: Exclude<ResourceType, 'LOCATION'>) => void;
  readonly refId: string;
  readonly onRefIdChange: (refId: string) => void;
  readonly name: string;
  readonly onNameChange: (name: string) => void;
  readonly staffOptions: readonly StaffListItem[];
  readonly wrappedStaffIds: ReadonlySet<string>;
  readonly nameError?: string;
  readonly refIdError?: string;
}

// Shared type-picker + STAFF-picker-or-name-field block, used by both ResourceCreateForm and
// ResourceEditFormFields — the identical "pick STAFF/ROOM/EQUIPMENT, then either wrap an
// existing Staff row or enter a display name" flow (dev-notes.md's CAND-01 main flow).
export function ResourceIdentityFields({
  showTypePicker,
  type,
  onTypeChange,
  refId,
  onRefIdChange,
  name,
  onNameChange,
  staffOptions,
  wrappedStaffIds,
  nameError,
  refIdError,
}: ResourceIdentityFieldsProps): React.JSX.Element {
  const t = useTranslations('dashboard.resourcesPage');
  // Only active staff can be newly wrapped (S01's own domain rule) — but keep the currently
  // selected option visible (disabled) if it points at a since-deactivated staff member, so
  // editing an already-wrapped resource still shows its real current selection instead of
  // silently falling back to a blank/first option (Codex review finding, PR #459).
  const selectableStaffOptions = staffOptions.filter(
    (staff) => staff.isActive || staff.id === refId,
  );

  return (
    <>
      {showTypePicker && (
        <div>
          <label className="mb-1.5 block text-sm font-semibold text-gray-900">
            {t('typeLabel')}
          </label>
          <div className="grid grid-cols-3 gap-3">
            {EDITABLE_TYPES.map((option) => (
              <button
                key={option}
                type="button"
                data-testid="resource-identity-type-option"
                data-type={option}
                onClick={() => onTypeChange(option)}
                className={cn(
                  'rounded-2xl border p-3.5 text-center text-sm font-semibold transition-colors',
                  type === option
                    ? 'border-blue-600 bg-blue-50 text-blue-700'
                    : 'border-border bg-white text-gray-700 hover:bg-slate-50',
                )}
              >
                {t(TYPE_CARD_LABEL_KEY[option])}
              </button>
            ))}
          </div>
        </div>
      )}

      {type === 'STAFF' ? (
        <div>
          <label className="mb-1.5 block text-sm font-semibold text-gray-900">
            {t('staffLabel')}
          </label>
          <select
            data-testid="resource-identity-staff-select"
            value={refId}
            onChange={(event) => onRefIdChange(event.target.value)}
            aria-invalid={Boolean(refIdError)}
            className={INPUT_CLASS}
          >
            <option value="">{t('staffPlaceholder')}</option>
            {selectableStaffOptions.map((staff) => (
              <option
                key={staff.id}
                value={staff.id}
                disabled={wrappedStaffIds.has(staff.id) || !staff.isActive}
              >
                {staff.name ?? staff.email}
                {wrappedStaffIds.has(staff.id) ? ` — ${t('staffAlreadyResource')}` : ''}
              </option>
            ))}
          </select>
          <p className="mt-1.5 text-sm text-gray-500">{t('staffHint')}</p>
          {refIdError && <p className="mt-1.5 text-sm text-red-600">{refIdError}</p>}
        </div>
      ) : (
        <div>
          <label className="mb-1.5 block text-sm font-semibold text-gray-900">
            {type === 'ROOM' ? t('roomNameLabel') : t('equipmentNameLabel')}
          </label>
          <input
            data-testid="resource-identity-name-input"
            type="text"
            value={name}
            onChange={(event) => onNameChange(event.target.value)}
            placeholder={type === 'ROOM' ? t('roomNamePlaceholder') : t('equipmentNamePlaceholder')}
            aria-invalid={Boolean(nameError)}
            className={INPUT_CLASS}
          />
          <p className="mt-1.5 text-sm text-gray-500">
            {type === 'ROOM' ? t('roomNameHint') : t('equipmentNameHint')}
          </p>
          {nameError && <p className="mt-1.5 text-sm text-red-600">{nameError}</p>}
        </div>
      )}
    </>
  );
}
