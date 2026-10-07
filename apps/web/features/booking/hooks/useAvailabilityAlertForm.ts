'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import {
  BookingErrorCode,
  type AvailabilityAlertResponse,
  type AvailabilityAlertWeekday,
  type CreateAvailabilityAlertRequest,
} from '@ikaro/types';
import { createAvailabilityAlert } from '@/features/booking/api/availability-alerts';
import {
  buildAvailabilityAlertRequest,
  initialAvailabilityAlertForm,
  validateAvailabilityAlertForm,
  type AvailabilityAlertFormErrors,
  type AvailabilityAlertFormState,
} from '@/features/booking/model/availability-alert-form';
import { resolveSupportedLocale, type SupportedLocale } from '@/shared/lib/i18n/get-messages';
import { extractProblemCode, resolveErrorMessage } from '@/shared/lib/i18n/resolve-error-message';
import { useFormatting } from '@/shared/lib/formatting/use-formatting';
import type { AlertResourceState } from './useResolvedAlertResource';

export type AvailabilityAlertView =
  | { readonly kind: 'form' }
  | { readonly kind: 'saved'; readonly alert: AvailabilityAlertResponse }
  | { readonly kind: 'cap' }
  | { readonly kind: 'ineligible' };

type SubmitFailure = { readonly view: AvailabilityAlertView } | { readonly message: string };

// What a server answer to the create call turns into: the cap view on 409
// BOOKING_ALERT_CAP_REACHED, the not-eligible view on 422 BOOKING_ALERT_INELIGIBLE_SERVICE, any
// other problem code as its translated message, and a plain failure message when there is no code
// at all (a network error).
function classifyFailure(err: unknown, locale: SupportedLocale, fallback: string): SubmitFailure {
  const code = extractProblemCode(err);
  if (code === BookingErrorCode.ALERT_CAP_REACHED) return { view: { kind: 'cap' } };
  if (code === BookingErrorCode.ALERT_INELIGIBLE_SERVICE) return { view: { kind: 'ineligible' } };
  return { message: code ? resolveErrorMessage(code, locale) : fallback };
}

// The fields the customer edits. Any edit clears the field errors — they described the old value.
function useAlertFields() {
  const [form, setForm] = useState<AvailabilityAlertFormState>(initialAvailabilityAlertForm);
  const [errors, setErrors] = useState<AvailabilityAlertFormErrors>({});

  const update = (patch: Partial<AvailabilityAlertFormState>): void => {
    setForm((current) => ({ ...current, ...patch }));
    setErrors({});
  };
  const toggleWeekday = (day: AvailabilityAlertWeekday): void =>
    update({
      weekdays: form.weekdays.includes(day)
        ? form.weekdays.filter((selected) => selected !== day)
        : [...form.weekdays, day],
    });

  return { form, errors, setErrors, update, toggleWeekday };
}

// The create call and where it leaves the page: the confirmation on 201, otherwise the view or
// message `classifyFailure` picked.
function useAlertSubmission(locale: SupportedLocale, fallbackMessage: string) {
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [view, setView] = useState<AvailabilityAlertView>({ kind: 'form' });

  const send = async (request: CreateAvailabilityAlertRequest): Promise<void> => {
    setSubmitting(true);
    setSubmitError(null);
    try {
      setView({ kind: 'saved', alert: await createAvailabilityAlert(request) });
    } catch (err) {
      const failure = classifyFailure(err, locale, fallbackMessage);
      if ('view' in failure) setView(failure.view);
      else setSubmitError(failure.message);
    } finally {
      setSubmitting(false);
    }
  };

  return { submitting, submitError, view, send, backToForm: () => setView({ kind: 'form' }) };
}

interface Params {
  readonly serviceId: string;
  readonly resource: AlertResourceState;
  readonly durationMinutes: number | null;
}

// The alert form's state machine: validate, then send, then show what the server answered.
export function useAvailabilityAlertForm({ serviceId, resource, durationMinutes }: Params) {
  const t = useTranslations('booking');
  const locale = resolveSupportedLocale(useLocale());
  const { timezone } = useFormatting();
  const fields = useAlertFields();
  const flow = useAlertSubmission(locale, t('availabilityAlert.errors.submitFailed'));

  const submit = async (event: React.SyntheticEvent): Promise<void> => {
    event.preventDefault();
    const now = new Date();
    const found = validateAvailabilityAlertForm(fields.form, timezone, now);
    if (Object.keys(found).length > 0) {
      fields.setErrors(found);
      return;
    }
    const params = {
      serviceId,
      preferredResourceId: resource.status === 'ready' ? resource.id : null,
      durationMinutes,
    };
    await flow.send(buildAvailabilityAlertRequest(fields.form, params, timezone, now));
  };

  return { ...fields, ...flow, submit };
}
