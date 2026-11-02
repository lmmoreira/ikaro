'use client';

import { useCallback, useMemo, useState, type SubmitEvent } from 'react';
import { useTranslations } from 'next-intl';
import type { TenantSettingsResponse } from '@ikaro/types';
import { renameTenant, updateTenantSettings } from '@/features/platform/api/tenant-settings';
import type { AddressLookup } from '@/shared/lib/address/address-lookup.port';
import { viaCepAddressLookup } from '@/shared/lib/address/viacep-address-lookup.adapter';
import { useFormFeedback } from '@/shared/lib/feedback/use-form-feedback';
import {
  resolveApiErrorFeedback,
  resolveErrorMessageFromApiError,
} from '@/shared/lib/i18n/resolve-error-message';
import { useResolvedLocale } from '@/shared/lib/i18n/use-resolved-locale';
import { useFormatting } from '@/shared/lib/formatting/use-formatting';
import { useSettingsZipLookup } from '@/features/platform/hooks/useSettingsZipLookup';
import {
  resolveSettingsLocalization,
  toSettingsFormValues,
  validateSettingsForm,
  type DayHoursValue,
  type SettingsAddressValues,
  type SettingsFormErrors,
  type SettingsFormValues,
  type SettingsSocialLinksValues,
  type WeekDay,
} from '@/features/platform/settings-form';
import { SettingsGeneralSection } from './SettingsGeneralSection';
import { SettingsBookingSection } from './SettingsBookingSection';
import { SettingsLoyaltySection } from './SettingsLoyaltySection';
import { SettingsHoursSection } from './SettingsHoursSection';
import { SettingsContactSection } from './SettingsContactSection';
import { SettingsChatbotSection } from './SettingsChatbotSection';
import { SettingsLeadFormSection } from './SettingsLeadFormSection';
import { SettingsLocalizationSection } from './SettingsLocalizationSection';
import { SettingsActionPane } from './SettingsFormActions';

// Backend problem `field` paths that are not the form's own field names. A path absent here is
// matched against the registered field names as is; anything else becomes the pane message.
const SERVER_FIELD_TO_FORM_FIELD: Readonly<Record<string, keyof SettingsFormErrors>> = {
  'chatbot.knowledgeText': 'knowledgeText',
};

function withoutEmptyErrors(errors: SettingsFormErrors): Record<string, string> {
  return Object.fromEntries(Object.entries(errors).filter(([, message]) => message));
}

const COPYABLE_WEEKDAYS = [
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
] as const satisfies readonly WeekDay[];

interface SettingsFormProps {
  readonly initial: TenantSettingsResponse;
  // Injectable for tests — defaults to the real ViaCEP adapter, same pattern as the
  // booking flow's AddressFields.tsx.
  readonly addressLookup?: AddressLookup;
}

export function SettingsForm({
  initial,
  addressLookup = viaCepAddressLookup,
}: SettingsFormProps): React.JSX.Element {
  const t = useTranslations('dashboard.settingsPage');
  const locale = useResolvedLocale();
  const { timeFormat } = useFormatting();
  const { addressSpec, phonePrefix, timezones } = resolveSettingsLocalization(
    initial.settings.localization.countryCode,
  );
  const [values, setValues] = useState<SettingsFormValues>(() => toSettingsFormValues(initial));
  const [currentName, setCurrentName] = useState(initial.name);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const feedback = useFormFeedback();
  const { clear: clearFeedback } = feedback;

  // The success card carries a title and a body; the hook's model holds the title only.
  const paneFeedback = useMemo(
    () =>
      feedback.feedback?.variant === 'success'
        ? { ...feedback.feedback, body: t('successBody') }
        : feedback.feedback,
    [feedback.feedback, t],
  );

  const setField = useCallback(
    <K extends keyof SettingsFormValues>(key: K, value: SettingsFormValues[K]): void => {
      setValues((prev) => ({ ...prev, [key]: value }));
      clearFeedback();
    },
    [clearFeedback],
  );

  const setAddressField = useCallback(
    (key: keyof SettingsAddressValues, value: string): void => {
      setValues((prev) => ({ ...prev, address: { ...prev.address, [key]: value } }));
      clearFeedback();
    },
    [clearFeedback],
  );

  const setSocialLinksField = useCallback(
    (key: keyof SettingsSocialLinksValues, value: string): void => {
      setValues((prev) => ({ ...prev, socialLinks: { ...prev.socialLinks, [key]: value } }));
      clearFeedback();
    },
    [clearFeedback],
  );

  // Stable reference — passed directly as DayRow's onChange prop so memoization holds.
  const setDay = useCallback(
    (day: WeekDay, patch: Partial<DayHoursValue>): void => {
      setValues((prev) => ({
        ...prev,
        days: { ...prev.days, [day]: { ...prev.days[day], ...patch } },
      }));
      clearFeedback();
    },
    [clearFeedback],
  );

  const handleCopyMondayToWeekdays = useCallback((): void => {
    setValues((prev) => {
      const { open, close } = prev.days.monday;
      const days = { ...prev.days };
      for (const day of COPYABLE_WEEKDAYS) {
        days[day] = { ...days[day], open, close };
      }
      return { ...prev, days };
    });
    clearFeedback();
  }, [clearFeedback]);

  const { isLookingUpZip, zipLookupFailed, handleZipCodeChange } = useSettingsZipLookup({
    addressSpec,
    addressLookup,
    setAddressField,
    setValues,
  });

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    clearFeedback();

    const { errors, normalized } = validateSettingsForm(
      values,
      initial.settings.localization.countryCode,
      t,
    );
    if (!normalized) {
      feedback.setFieldErrors(withoutEmptyErrors(errors));
      return;
    }

    setIsSubmitting(true);
    try {
      await updateTenantSettings({ settings: normalized.settings });
    } catch (err) {
      // chatbot.knowledgeText is the only settings field validated purely server-side (no
      // client-side length cap, since the resolved max can be a per-tenant Ikaro-only override
      // never exposed to this form), and its backend path differs from the input's name.
      const { message, field } = resolveApiErrorFeedback(err, locale);
      const formField = field ? SERVER_FIELD_TO_FORM_FIELD[field] : undefined;
      if (formField) {
        feedback.setError(message);
        feedback.setFieldErrors({ [formField]: message });
      } else {
        feedback.setFromApiError(err, locale);
      }
      setIsSubmitting(false);
      return;
    }

    // Settings and the tenant rename are two separate backend calls — if the rename fails
    // after settings already saved, the user must be told the truth (partial success), not
    // a blanket "nothing was saved" message. The translation string carries that
    // partial-success fact (which no error code could convey) around a `{reason}`
    // placeholder — not string concatenation, which would hardcode word order and break in
    // languages that need the dynamic text placed somewhere other than the end. The pane holds
    // one message, so it shows this error (no success card) and the name input carries the reason.
    if (normalized.name !== currentName) {
      try {
        await renameTenant({ name: normalized.name });
        setCurrentName(normalized.name);
      } catch (err) {
        const reason = resolveErrorMessageFromApiError(err, locale);
        feedback.setError(t('errors.renamePartialFailure', { reason }));
        feedback.setFieldErrors({ name: reason });
        setIsSubmitting(false);
        return;
      }
    }

    feedback.setSuccess(t('successTitle'));
    setIsSubmitting(false);
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4 pb-28 lg:space-y-6 lg:pb-0">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
        <div className="space-y-4 lg:space-y-6">
          <SettingsGeneralSection
            slug={initial.slug}
            name={values.name}
            feedback={feedback}
            onNameChange={(value) => setField('name', value)}
          />

          <SettingsBookingSection values={values} feedback={feedback} onFieldChange={setField} />

          <SettingsLoyaltySection values={values} feedback={feedback} onFieldChange={setField} />

          <SettingsHoursSection
            timezone={values.timezone}
            feedback={feedback}
            timezones={timezones}
            days={values.days}
            timeFormat={timeFormat}
            onTimezoneChange={(value) => setField('timezone', value)}
            onDayChange={setDay}
            onCopyMondayToWeekdays={handleCopyMondayToWeekdays}
          />

          <SettingsContactSection
            values={values}
            feedback={feedback}
            addressSpec={addressSpec}
            phonePrefix={phonePrefix}
            isLookingUpZip={isLookingUpZip}
            zipLookupFailed={zipLookupFailed}
            onFieldChange={setField}
            onAddressFieldChange={setAddressField}
            onSocialLinksFieldChange={setSocialLinksField}
            onZipCodeChange={(raw) => {
              void handleZipCodeChange(raw);
            }}
          />

          <SettingsChatbotSection
            knowledgeText={values.knowledgeText}
            feedback={feedback}
            onChange={(value) => setField('knowledgeText', value)}
          />

          <SettingsLeadFormSection values={values} feedback={feedback} onFieldChange={setField} />

          <SettingsLocalizationSection
            countryCode={initial.settings.localization.countryCode}
            currency={initial.settings.localization.currency}
            language={initial.settings.localization.language}
          />
        </div>

        <SettingsActionPane isSubmitting={isSubmitting} feedback={paneFeedback} />
      </div>
    </form>
  );
}
