'use client';

import { useTranslations } from 'next-intl';
import type { AddressSpec } from '@ikaro/i18n';
import { SectionCard } from '@/shared/components/ui/section-card';
import type {
  SettingsAddressValues,
  SettingsFormErrors,
  SettingsFormValues,
  SettingsSocialLinksValues,
} from '@/features/platform/settings-form';
import { TextField } from './SettingsFormFields';
import { PhoneField, PostalCodeField, addressSpecFieldLabel } from './SettingsFormAdvancedFields';

interface SettingsContactSectionProps {
  readonly values: SettingsFormValues;
  readonly fieldErrors: SettingsFormErrors;
  readonly addressSpec: AddressSpec;
  readonly phonePrefix: string;
  readonly isLookingUpZip: boolean;
  readonly zipLookupFailed: boolean;
  readonly onFieldChange: <K extends keyof SettingsFormValues>(
    key: K,
    value: SettingsFormValues[K],
  ) => void;
  readonly onAddressFieldChange: (key: keyof SettingsAddressValues, value: string) => void;
  readonly onSocialLinksFieldChange: (key: keyof SettingsSocialLinksValues, value: string) => void;
  readonly onZipCodeChange: (rawValue: string) => void;
}

// Extracted from SettingsForm (TD37-S5A) — the "Contact" section (phone/email, address, and
// social links) is a self-contained, cohesive group, unrelated to the other SectionCard groups
// around it.
export function SettingsContactSection({
  values,
  fieldErrors,
  addressSpec,
  phonePrefix,
  isLookingUpZip,
  zipLookupFailed,
  onFieldChange,
  onAddressFieldChange,
  onSocialLinksFieldChange,
  onZipCodeChange,
}: SettingsContactSectionProps): React.JSX.Element {
  const t = useTranslations('dashboard.settingsPage');

  return (
    <SectionCard title={t('sections.contact')}>
      <div className="grid gap-4 md:grid-cols-2">
        <PhoneField
          id="settings-phone"
          prefixTestId="settings-phone-prefix"
          label={t('phoneLabel')}
          value={values.phone}
          phonePrefix={phonePrefix}
          error={fieldErrors.phone}
          onChange={(localDigits) => onFieldChange('phone', localDigits)}
        />
        <TextField
          id="settings-email"
          label={t('emailLabel')}
          type="email"
          value={values.email}
          error={fieldErrors.email}
          placeholder={t('emailPlaceholder')}
          onChange={(value) => onFieldChange('email', value)}
        />
      </div>
      <fieldset className="space-y-4">
        <legend className="text-sm font-semibold text-gray-900">{t('addressLegend')}</legend>
        <p className="text-sm text-gray-500">{t('addressHint')}</p>
        <div className="grid gap-4 md:grid-cols-2">
          <PostalCodeField
            label={addressSpec.postalLabel}
            value={values.address.zipCode}
            postalPlaceholder={addressSpec.postalPlaceholder}
            error={fieldErrors.addressZipCode}
            isLookingUp={isLookingUpZip}
            lookupFailed={zipLookupFailed}
            searchingLabel={t('addressZipSearching')}
            notFoundLabel={t('addressZipNotFound')}
            onChange={onZipCodeChange}
          />
          <TextField
            id="settings-address-number"
            label={addressSpecFieldLabel(addressSpec, 'number')}
            value={values.address.number}
            error={fieldErrors.addressNumber}
            onChange={(value) => onAddressFieldChange('number', value)}
          />
        </div>
        <TextField
          id="settings-address-street"
          label={addressSpecFieldLabel(addressSpec, 'street')}
          value={values.address.street}
          error={fieldErrors.addressStreet}
          onChange={(value) => onAddressFieldChange('street', value)}
        />
        <div className="grid gap-4 md:grid-cols-2">
          <TextField
            id="settings-address-complement"
            label={addressSpecFieldLabel(addressSpec, 'complement')}
            value={values.address.complement}
            onChange={(value) => onAddressFieldChange('complement', value)}
          />
          {addressSpec.requireNeighborhood && (
            <TextField
              id="settings-address-neighborhood"
              label={addressSpecFieldLabel(addressSpec, 'neighborhood')}
              value={values.address.neighborhood}
              error={fieldErrors.addressNeighborhood}
              onChange={(value) => onAddressFieldChange('neighborhood', value)}
            />
          )}
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <TextField
            id="settings-address-city"
            label={addressSpecFieldLabel(addressSpec, 'city')}
            value={values.address.city}
            error={fieldErrors.addressCity}
            onChange={(value) => onAddressFieldChange('city', value)}
          />
          <TextField
            id="settings-address-state"
            label={addressSpecFieldLabel(addressSpec, 'state')}
            maxLength={addressSpec.stateMaxLen ?? undefined}
            value={values.address.state}
            error={fieldErrors.addressState}
            onChange={(value) => onAddressFieldChange('state', value)}
          />
        </div>
      </fieldset>
      <fieldset className="space-y-4">
        <legend className="text-sm font-semibold text-gray-900">{t('socialLinksLegend')}</legend>
        <div className="grid gap-4 md:grid-cols-3">
          <PhoneField
            id="settings-social-whatsapp"
            prefixTestId="settings-social-whatsapp-prefix"
            label={t('socialLinksWhatsappLabel')}
            value={values.socialLinks.whatsapp}
            phonePrefix={phonePrefix}
            error={fieldErrors.socialLinksWhatsapp}
            onChange={(localDigits) => onSocialLinksFieldChange('whatsapp', localDigits)}
          />
          <TextField
            id="settings-social-instagram"
            label={t('socialLinksInstagramLabel')}
            type="url"
            value={values.socialLinks.instagram}
            placeholder="https://instagram.com/..."
            onChange={(value) => onSocialLinksFieldChange('instagram', value)}
          />
          <TextField
            id="settings-social-facebook"
            label={t('socialLinksFacebookLabel')}
            type="url"
            value={values.socialLinks.facebook}
            placeholder="https://facebook.com/..."
            onChange={(value) => onSocialLinksFieldChange('facebook', value)}
          />
        </div>
      </fieldset>
    </SectionCard>
  );
}
