'use client';

import { useTranslations } from 'next-intl';
import { Card, CardContent } from '@/shared/components/ui/card';

interface IntakeParticipantsCardProps {
  readonly participantCountRequired: boolean;
  readonly requiresNamedAttendees: boolean;
  readonly onChangeParticipantCountRequired: (value: boolean) => void;
  readonly onChangeRequiresNamedAttendees: (value: boolean) => void;
}

export function IntakeParticipantsCard({
  participantCountRequired,
  requiresNamedAttendees,
  onChangeParticipantCountRequired,
  onChangeRequiresNamedAttendees,
}: IntakeParticipantsCardProps): React.JSX.Element {
  const t = useTranslations('dashboard.servicesPage');

  return (
    <Card>
      <CardContent className="space-y-3 p-5">
        <h2 className="text-sm font-semibold text-gray-900">
          {t('formularioParticipantsCardTitle')}
        </h2>
        <div className="flex items-center justify-between gap-3 rounded-2xl bg-slate-50 px-4 py-3">
          <label htmlFor="intake-participant-count-required">
            <span className="block text-sm font-semibold text-gray-900">
              {t('formularioParticipantCountLabel')}
            </span>
            <span className="block text-xs text-gray-500">
              {t('formularioParticipantCountSub')}
            </span>
          </label>
          <input
            id="intake-participant-count-required"
            type="checkbox"
            data-testid="intake-participant-count-required"
            checked={participantCountRequired}
            onChange={(event) => onChangeParticipantCountRequired(event.target.checked)}
          />
        </div>
        <div className="flex items-center justify-between gap-3 rounded-2xl bg-slate-50 px-4 py-3">
          <label htmlFor="intake-requires-named-attendees">
            <span className="block text-sm font-semibold text-gray-900">
              {t('formularioNamedAttendeesLabel')}
            </span>
            <span className="block text-xs text-gray-500">{t('formularioNamedAttendeesSub')}</span>
          </label>
          <input
            id="intake-requires-named-attendees"
            type="checkbox"
            data-testid="intake-requires-named-attendees"
            checked={requiresNamedAttendees}
            onChange={(event) => onChangeRequiresNamedAttendees(event.target.checked)}
          />
        </div>
      </CardContent>
    </Card>
  );
}

interface IntakeConsentCardProps {
  readonly consentText: string;
  readonly onChange: (value: string) => void;
}

export function IntakeConsentCard({
  consentText,
  onChange,
}: IntakeConsentCardProps): React.JSX.Element {
  const t = useTranslations('dashboard.servicesPage');

  return (
    <Card>
      <CardContent className="space-y-2 p-5">
        <h2 className="text-sm font-semibold text-gray-900">{t('formularioConsentCardTitle')}</h2>
        <label
          htmlFor="intake-consent-text"
          className="mb-1 block text-sm font-semibold text-gray-900"
        >
          {t('formularioConsentLabel')}
        </label>
        <textarea
          id="intake-consent-text"
          data-testid="intake-consent-text"
          value={consentText}
          onChange={(event) => onChange(event.target.value)}
          maxLength={5000}
          className="min-h-28 w-full rounded-md border border-gray-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-blue-500"
        />
        <p className="text-xs text-gray-500">{t('formularioConsentHint')}</p>
      </CardContent>
    </Card>
  );
}
