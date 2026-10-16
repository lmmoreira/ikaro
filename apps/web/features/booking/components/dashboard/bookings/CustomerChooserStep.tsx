'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/shared/components/ui/button';
import { Card, CardContent } from '@/shared/components/ui/card';
import { findContactError, type ContactField } from '@/features/booking/model/contact-validation';
import type { StaffBookingRecipient } from '@/features/booking/model/staff-booking-payload';
import type { StaffGuestContact } from '@/features/booking/hooks/useStaffGuestContact';
import { BookingOutcomeActionRail } from './BookingOutcomeActionRail';
import { CustomerSearchPanel } from './CustomerSearchPanel';
import { GuestContactForm } from './GuestContactForm';

export type StaffBookingKind = 'agendamento' | 'recorrencia';
type ChooserMode = 'registered' | 'guest';

interface CustomerChooserStepProps {
  readonly kind: StaffBookingKind;
  readonly phonePrefix: string;
  readonly onContinue: (recipient: StaffBookingRecipient) => void;
  readonly onCancel: () => void;
}

const EMPTY_GUEST: StaffGuestContact = { contactName: '', contactPhone: '', contactEmail: '' };

function ModeTab({
  mode,
  current,
  disabled,
  onSelect,
}: {
  readonly mode: ChooserMode;
  readonly current: ChooserMode;
  readonly disabled?: boolean;
  readonly onSelect: (mode: ChooserMode) => void;
}): React.JSX.Element {
  const t = useTranslations('dashboard.newBooking.chooser');
  const active = mode === current;
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      disabled={disabled}
      data-testid="chooser-tab"
      data-mode={mode}
      onClick={() => onSelect(mode)}
      className={`flex-1 rounded-md px-3 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
        active ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600 hover:text-gray-900'
      }`}
    >
      {t(`tabs.${mode}`)}
    </button>
  );
}

// The first step of everything staff create on a customer's behalf (UC-108; M23-S19 reuses it for
// "Recorrência"): a registered customer, or the contact of someone who is not in the system.
// A recurrence needs an account (UC-070), so the second mode is disabled for it, with its reason.
export function CustomerChooserStep({
  kind,
  phonePrefix,
  onContinue,
  onCancel,
}: CustomerChooserStepProps): React.JSX.Element {
  const t = useTranslations('dashboard.newBooking.chooser');
  const tc = useTranslations('common');
  const [mode, setMode] = useState<ChooserMode>('registered');
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [guest, setGuest] = useState<StaffGuestContact>(EMPTY_GUEST);
  const [errorField, setErrorField] = useState<ContactField | null>(null);
  const guestDisabled = kind === 'recorrencia';
  const canContinue = mode === 'registered' ? customerId !== null : true;

  function handleContinue(): void {
    if (mode === 'registered') {
      if (customerId) onContinue({ kind: 'customer', customerId });
      return;
    }
    const field = findContactError(guest);
    setErrorField(field);
    if (!field) onContinue({ kind: 'guest', ...guest });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]" data-testid="customer-chooser">
      <div className="space-y-4">
        <div>
          <h2 className="text-xl font-bold text-gray-900">{t('heading')}</h2>
          <p className="mt-1 text-sm text-gray-600">{t('description')}</p>
        </div>

        <div role="tablist" className="flex gap-1 rounded-lg bg-gray-100 p-1">
          <ModeTab mode="registered" current={mode} onSelect={setMode} />
          <ModeTab mode="guest" current={mode} disabled={guestDisabled} onSelect={setMode} />
        </div>
        {guestDisabled && (
          <p className="text-sm text-gray-600" data-testid="guest-disabled-reason">
            {t('recurrenceNeedsAccount')}
          </p>
        )}

        <Card>
          <CardContent className="p-4">
            {mode === 'registered' ? (
              <CustomerSearchPanel selectedId={customerId} onSelect={setCustomerId} />
            ) : (
              <GuestContactForm
                value={guest}
                phonePrefix={phonePrefix}
                errorField={errorField}
                onChange={(next) => {
                  setGuest(next);
                  setErrorField(null);
                }}
              />
            )}
          </CardContent>
        </Card>
      </div>

      <BookingOutcomeActionRail>
        <Card>
          <CardContent className="space-y-3 p-4">
            <p className="text-sm text-gray-600">{t('footerHint')}</p>
            <Button
              type="button"
              className="w-full"
              disabled={!canContinue}
              data-testid="chooser-continue"
              onClick={handleContinue}
            >
              {t('continue')}
            </Button>
            <Button
              type="button"
              className="w-full border-0 bg-white text-gray-900 shadow-sm hover:bg-gray-50"
              onClick={onCancel}
            >
              {tc('cancel')}
            </Button>
          </CardContent>
        </Card>
      </BookingOutcomeActionRail>
    </div>
  );
}
