'use client';

import type React from 'react';
import { useTranslations } from 'next-intl';
import type { AttendeeDraft } from '@/features/booking/model/intake-answers';
import {
  INTAKE_ERROR_CHIP_CLASS,
  INTAKE_ERROR_CHIP_STYLE,
  INTAKE_ERROR_COLOR,
} from './IntakeQuestionField';

interface IntakeAttendeesListProps {
  readonly attendees: readonly AttendeeDraft[];
  readonly hasError: boolean;
  readonly onChange: (attendees: AttendeeDraft[]) => void;
}

const secondaryButton: React.CSSProperties = {
  borderRadius: 'var(--ba-radius)',
  borderColor: 'var(--ba-secondary)',
  color: 'var(--ba-text)',
};

// Optional, repeatable { name, isMinor } rows. There is deliberately no minimum count: the backend
// never requires an attendee, nor ties the count to participantCount.
export function IntakeAttendeesList({
  attendees,
  hasError,
  onChange,
}: IntakeAttendeesListProps): React.JSX.Element {
  const t = useTranslations('booking.intake');

  function update(index: number, patch: Partial<AttendeeDraft>) {
    onChange(attendees.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  return (
    <fieldset className="my-4 border-0 p-0" data-testid="intake-attendees">
      <legend className="mb-1.5 text-sm font-medium" style={{ color: 'var(--ba-text)' }}>
        {t('attendeesLegend')}
      </legend>
      {attendees.map((row, index) => (
        <div key={index} className="mb-2 flex items-center gap-2">
          <input
            type="text"
            data-testid="intake-attendee-name"
            maxLength={255}
            className="min-w-0 flex-1 border px-3 py-2"
            style={{
              borderRadius: 'var(--ba-radius)',
              borderColor:
                hasError && row.name.trim() === '' ? INTAKE_ERROR_COLOR : 'var(--ba-secondary)',
              backgroundColor: 'var(--ba-secondary)',
              color: 'var(--ba-text)',
            }}
            aria-label={t('attendeeNameLabel', { index: index + 1 })}
            placeholder={t('attendeeNamePlaceholder')}
            value={row.name}
            onChange={(e) => update(index, { name: e.target.value })}
          />
          <label className="inline-flex items-center gap-1.5 whitespace-nowrap text-sm">
            <input
              type="checkbox"
              data-testid="intake-attendee-minor"
              checked={row.isMinor}
              onChange={(e) => update(index, { isMinor: e.target.checked })}
            />
            {t('attendeeMinor')}
          </label>
          <button
            type="button"
            data-testid="intake-attendee-remove"
            className="cursor-pointer border px-2.5 py-1.5 text-sm"
            style={secondaryButton}
            aria-label={t('attendeeRemoveLabel', { index: index + 1 })}
            onClick={() => onChange(attendees.filter((_, i) => i !== index))}
          >
            {t('attendeeRemove')}
          </button>
        </div>
      ))}
      {hasError && (
        <p
          className={`${INTAKE_ERROR_CHIP_CLASS} mb-2`}
          style={INTAKE_ERROR_CHIP_STYLE}
          data-testid="intake-field-error-attendees"
        >
          {t('attendeeNameError')}
        </p>
      )}
      <button
        type="button"
        data-testid="intake-add-attendee"
        className="cursor-pointer border px-3.5 py-2 text-sm"
        style={secondaryButton}
        onClick={() => onChange([...attendees, { name: '', isMinor: false }])}
      >
        {t('addAttendee')}
      </button>
      <p className="mt-1.5 text-sm" style={{ color: 'var(--ba-text)', opacity: 0.7 }}>
        {t('attendeesHint')}
      </p>
    </fieldset>
  );
}
