'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/shared/components/ui/button';
import { Card, CardContent } from '@/shared/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shared/components/ui/tabs';
import { findContactError } from '@/features/booking/model/contact-validation';
import type { StaffBookingRecipient } from '@/features/booking/model/staff-booking-payload';
import type { StaffGuestContact } from '@/features/booking/hooks/useStaffGuestContact';
import { useFormFeedback } from '@/shared/lib/feedback/use-form-feedback';
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
  disabled,
}: {
  readonly mode: ChooserMode;
  readonly disabled?: boolean;
}): React.JSX.Element {
  const t = useTranslations('dashboard.newBooking.chooser');
  return (
    <TabsTrigger value={mode} disabled={disabled} data-testid="chooser-tab" data-mode={mode}>
      {t(`tabs.${mode}`)}
    </TabsTrigger>
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
  const feedback = useFormFeedback();
  const guestDisabled = kind === 'recorrencia';
  const canContinue = mode === 'registered' ? customerId !== null : true;

  function handleContinue(): void {
    if (mode === 'registered') {
      if (customerId) onContinue({ kind: 'customer', customerId });
      return;
    }
    const field = findContactError(guest);
    if (field) {
      feedback.setFieldErrors({ [field]: t('guestRequired') });
      return;
    }
    feedback.clear();
    onContinue({ kind: 'guest', ...guest });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]" data-testid="customer-chooser">
      <div className="space-y-4">
        <div>
          <h2 className="text-xl font-bold text-gray-900">{t('heading')}</h2>
          <p className="mt-1 text-sm text-gray-600">{t('description')}</p>
        </div>

        <Tabs
          value={mode}
          onValueChange={(value) => setMode(value as ChooserMode)}
          className="space-y-4"
        >
          <TabsList variant="segmented">
            <ModeTab mode="registered" />
            <ModeTab mode="guest" disabled={guestDisabled} />
          </TabsList>
          {guestDisabled && (
            <p className="text-sm text-gray-600" data-testid="guest-disabled-reason">
              {t('recurrenceNeedsAccount')}
            </p>
          )}

          <Card>
            <CardContent className="p-4">
              <TabsContent value="registered">
                <CustomerSearchPanel selectedId={customerId} onSelect={setCustomerId} />
              </TabsContent>
              <TabsContent value="guest">
                <GuestContactForm
                  value={guest}
                  phonePrefix={phonePrefix}
                  feedback={feedback}
                  onChange={feedback.edit(setGuest)}
                />
              </TabsContent>
            </CardContent>
          </Card>
        </Tabs>
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
            <Button type="button" variant="surface" className="w-full" onClick={onCancel}>
              {tc('cancel')}
            </Button>
          </CardContent>
        </Card>
      </BookingOutcomeActionRail>
    </div>
  );
}
