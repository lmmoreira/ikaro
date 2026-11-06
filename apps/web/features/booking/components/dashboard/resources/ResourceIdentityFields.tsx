'use client';

import { Input } from '@/shared/components/ui/input';
import { Label } from '@/shared/components/ui/label';
import { NativeSelect } from '@/shared/components/ui/native-select';
import { useTranslations } from 'next-intl';
import type { ResourceStaffOptionItem, ResourceType } from '@ikaro/types';
import { FIELD_INVALID_CLASS, FieldFeedback } from '@/shared/components/ui/field-feedback';
import type { useFormFeedback } from '@/shared/lib/feedback/use-form-feedback';
import { cn } from '@/shared/utils/cn';

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
  readonly staffOptions: readonly ResourceStaffOptionItem[];
  readonly feedback: Pick<
    ReturnType<typeof useFormFeedback>,
    'fieldProps' | 'fieldErrors' | 'fieldErrorId'
  >;
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
  feedback,
}: ResourceIdentityFieldsProps): React.JSX.Element {
  const t = useTranslations('dashboard.resourcesPage');
  const { fieldProps, fieldErrors, fieldErrorId } = feedback;
  // Only active staff can be newly wrapped (S01's own domain rule) — but keep the currently
  // selected option visible (disabled) if it points at a since-deactivated staff member, so
  // editing an already-wrapped resource still shows its real current selection instead of
  // silently falling back to a blank/first option.
  const selectableStaffOptions = staffOptions.filter(
    (staff) => staff.isActive || staff.id === refId,
  );

  return (
    <>
      {showTypePicker && (
        <div>
          <Label>{t('typeLabel')}</Label>
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
        <>
          <div>
            <Label htmlFor="resource-identity-staff">{t('staffLabel')}</Label>
            <NativeSelect
              id="resource-identity-staff"
              data-testid="resource-identity-staff-select"
              value={refId}
              onChange={(event) => {
                const newRefId = event.target.value;
                onRefIdChange(newRefId);
                // Resource.name is denormalized, independent of Staff.name (docs/DOMAIN_MODEL.md)
                // — seed it as a default from the picked staff member so the field never starts
                // blank, but it stays independently editable below, not re-derived on every save.
                const picked = staffOptions.find((staff) => staff.id === newRefId);
                if (picked) onNameChange(picked.name ?? '');
              }}
              {...fieldProps('refId')}
              className={cn(fieldErrors.refId && FIELD_INVALID_CLASS)}
            >
              <option value="">{t('staffPlaceholder')}</option>
              {selectableStaffOptions.map((staff) => (
                <option
                  key={staff.id}
                  value={staff.id}
                  disabled={staff.isWrapped || !staff.isActive}
                >
                  {staff.name ?? staff.email}
                  {staff.isWrapped ? ` — ${t('staffAlreadyResource')}` : ''}
                </option>
              ))}
            </NativeSelect>
            <p className="mt-1.5 text-sm text-gray-500">{t('staffHint')}</p>
            <FieldFeedback id={fieldErrorId('refId')}>{fieldErrors.refId}</FieldFeedback>
          </div>

          <div>
            <Label htmlFor="resource-identity-name">{t('staffNameLabel')}</Label>
            <Input
              id="resource-identity-name"
              data-testid="resource-identity-name-input"
              type="text"
              value={name}
              onChange={(event) => onNameChange(event.target.value)}
              placeholder={t('staffNamePlaceholder')}
              {...fieldProps('name')}
              className={cn(fieldErrors.name && FIELD_INVALID_CLASS)}
            />
            <FieldFeedback id={fieldErrorId('name')}>{fieldErrors.name}</FieldFeedback>
          </div>
        </>
      ) : (
        <div>
          <Label htmlFor="resource-identity-name">
            {type === 'ROOM' ? t('roomNameLabel') : t('equipmentNameLabel')}
          </Label>
          <Input
            id="resource-identity-name"
            data-testid="resource-identity-name-input"
            type="text"
            value={name}
            onChange={(event) => onNameChange(event.target.value)}
            placeholder={type === 'ROOM' ? t('roomNamePlaceholder') : t('equipmentNamePlaceholder')}
            {...fieldProps('name')}
            className={cn(fieldErrors.name && FIELD_INVALID_CLASS)}
          />
          <p className="mt-1.5 text-sm text-gray-500">
            {type === 'ROOM' ? t('roomNameHint') : t('equipmentNameHint')}
          </p>
          <FieldFeedback id={fieldErrorId('name')}>{fieldErrors.name}</FieldFeedback>
        </div>
      )}
    </>
  );
}
