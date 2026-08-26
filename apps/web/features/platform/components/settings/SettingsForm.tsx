'use client';

import { useCallback, useState, type SubmitEvent } from 'react';
import { useTranslations } from 'next-intl';
import type { TenantSettingsResponse } from '@ikaro/types';
import { renameTenant, updateTenantSettings } from '@/features/platform/api/tenant-settings';
import type { AddressLookup } from '@/shared/lib/address/address-lookup.port';
import { viaCepAddressLookup } from '@/shared/lib/address/viacep-address-lookup.adapter';
import { extractProblemDetailShape } from '@/shared/lib/api/errors';
import {
  resolveErrorMessage,
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
import { SettingsNotificationSection } from './SettingsNotificationSection';
import { SettingsHoursSection } from './SettingsHoursSection';
import { SettingsContactSection } from './SettingsContactSection';
import { SettingsChatbotSection } from './SettingsChatbotSection';
import { SettingsLeadFormSection } from './SettingsLeadFormSection';
import { SettingsLocalizationSection } from './SettingsLocalizationSection';
import { SettingsDesktopActions, SettingsMobileActionBar } from './SettingsFormActions';

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
  const [fieldErrors, setFieldErrors] = useState<SettingsFormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [saved, setSaved] = useState(false);

  const setField = useCallback(
    <K extends keyof SettingsFormValues>(key: K, value: SettingsFormValues[K]): void => {
      setValues((prev) => ({ ...prev, [key]: value }));
      setSaved(false);
    },
    [],
  );

  const setAddressField = useCallback((key: keyof SettingsAddressValues, value: string): void => {
    setValues((prev) => ({ ...prev, address: { ...prev.address, [key]: value } }));
    setSaved(false);
  }, []);

  const setSocialLinksField = useCallback(
    (key: keyof SettingsSocialLinksValues, value: string): void => {
      setValues((prev) => ({ ...prev, socialLinks: { ...prev.socialLinks, [key]: value } }));
      setSaved(false);
    },
    [],
  );

  // Stable reference — passed directly as DayRow's onChange prop so memoization holds.
  const setDay = useCallback((day: WeekDay, patch: Partial<DayHoursValue>): void => {
    setValues((prev) => ({
      ...prev,
      days: { ...prev.days, [day]: { ...prev.days[day], ...patch } },
    }));
    setSaved(false);
  }, []);

  const handleCopyMondayToWeekdays = useCallback((): void => {
    setValues((prev) => {
      const { open, close } = prev.days.monday;
      const days = { ...prev.days };
      for (const day of COPYABLE_WEEKDAYS) {
        days[day] = { ...days[day], open, close };
      }
      return { ...prev, days };
    });
    setSaved(false);
  }, []);

  const { isLookingUpZip, zipLookupFailed, handleZipCodeChange } = useSettingsZipLookup({
    addressSpec,
    addressLookup,
    setAddressField,
    setValues,
  });

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setSaved(false);

    const { errors, normalized } = validateSettingsForm(
      values,
      initial.settings.localization.countryCode,
      t,
    );
    setFieldErrors(errors);
    if (!normalized) return;

    setIsSubmitting(true);
    try {
      await updateTenantSettings({ settings: normalized.settings });
    } catch (err) {
      // chatbot.knowledgeText is the only settings field validated purely server-side (no
      // client-side length cap, since the resolved max can be a per-tenant Ikaro-only override
      // never exposed to this form) — its error is shown inline under the field, matching every
      // other field-level validation error, instead of the generic submit banner used for every
      // other API failure in this form (e.g. the rename partial-failure case below).
      const shape = extractProblemDetailShape(err);
      if (shape?.field === 'chatbot.knowledgeText') {
        setFieldErrors({ knowledgeText: resolveErrorMessage(shape.code, locale) });
      } else {
        setFieldErrors({ submit: resolveErrorMessageFromApiError(err, locale) });
      }
      setIsSubmitting(false);
      return;
    }

    // Settings and the tenant rename are two separate backend calls — if the rename fails
    // after settings already saved, the user must be told the truth (partial success), not
    // a blanket "nothing was saved" message. The translation string carries that
    // partial-success fact (which no error code could convey) around a `{reason}`
    // placeholder — not string concatenation, which would hardcode word order and break in
    // languages that need the dynamic text placed somewhere other than the end.
    if (normalized.name !== currentName) {
      try {
        await renameTenant({ name: normalized.name });
        setCurrentName(normalized.name);
      } catch (err) {
        setSaved(true);
        setFieldErrors({
          submit: t('errors.renamePartialFailure', {
            reason: resolveErrorMessageFromApiError(err, locale),
          }),
        });
        globalThis.scrollTo?.({ top: 0, behavior: 'smooth' });
        setIsSubmitting(false);
        return;
      }
    }

    setSaved(true);
    globalThis.scrollTo?.({ top: 0, behavior: 'smooth' });
    setIsSubmitting(false);
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4 pb-28 lg:space-y-6 lg:pb-0">
      {saved && (
        <output
          data-testid="settings-saved-banner"
          className="flex items-start gap-3.5 rounded-xl border border-green-300 bg-green-50 p-4"
        >
          <span
            aria-hidden="true"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-green-600 text-white"
          >
            ✓
          </span>
          <span>
            <span className="block text-sm font-bold text-green-800">{t('successTitle')}</span>
            <span className="mt-0.5 block text-sm text-green-700">{t('successBody')}</span>
          </span>
        </output>
      )}

      {fieldErrors.submit && (
        <div
          role="alert"
          data-testid="settings-submit-error"
          className="rounded-xl border border-red-300 bg-red-50 p-4 text-sm font-semibold text-red-700"
        >
          {fieldErrors.submit}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
        <div className="space-y-4 lg:space-y-6">
          <SettingsGeneralSection
            slug={initial.slug}
            name={values.name}
            nameError={fieldErrors.name}
            onNameChange={(value) => setField('name', value)}
          />

          <SettingsBookingSection
            values={values}
            fieldErrors={fieldErrors}
            onFieldChange={setField}
          />

          <SettingsLoyaltySection
            values={values}
            fieldErrors={fieldErrors}
            onFieldChange={setField}
          />

          <SettingsNotificationSection
            notificationFromEmail={values.notificationFromEmail}
            notificationFromEmailError={fieldErrors.notificationFromEmail}
            onChange={(value) => setField('notificationFromEmail', value)}
          />

          <SettingsHoursSection
            timezone={values.timezone}
            timezoneError={fieldErrors.timezone}
            timezones={timezones}
            days={values.days}
            timeFormat={timeFormat}
            onTimezoneChange={(value) => setField('timezone', value)}
            onDayChange={setDay}
            onCopyMondayToWeekdays={handleCopyMondayToWeekdays}
          />

          <SettingsContactSection
            values={values}
            fieldErrors={fieldErrors}
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
            knowledgeTextError={fieldErrors.knowledgeText}
            onChange={(value) => setField('knowledgeText', value)}
          />

          <SettingsLeadFormSection
            values={values}
            fieldErrors={fieldErrors}
            onFieldChange={setField}
          />

          <SettingsLocalizationSection
            countryCode={initial.settings.localization.countryCode}
            currency={initial.settings.localization.currency}
            language={initial.settings.localization.language}
          />
        </div>

        <SettingsDesktopActions isSubmitting={isSubmitting} />
      </div>

      <SettingsMobileActionBar isSubmitting={isSubmitting} />
    </form>
  );
}
