'use client';

import { useTranslations } from 'next-intl';
import type { HotsiteBrandingResponse } from '@ikaro/types';
import { SectionCard } from '@/shared/components/ui/section-card';
import { FontPicker, type FontPickerOption } from '@/shared/components/ui/font-picker';
import { PillSelect } from '@/shared/components/ui/pill-select';
import { SwitchField } from '@/shared/components/ui/switch-field';
import { FONT_MAP, FONT_VARIABLES } from '@/features/platform/hotsite/font-config';
import { LogoUpload } from '@/features/platform/components/hotsite/LogoUpload';
import { BrandingColorsSection } from './BrandingColorsSection';

const FONT_OPTIONS: readonly FontPickerOption[] = Object.entries(FONT_MAP).map(
  ([name, cssValue]) => ({ name, cssValue }),
);
// The public hotsite only loads the tenant's 2 currently-active fonts (getActiveFontVariables,
// [slug]/layout.tsx) — nothing in the /dashboard tree loads any of the 8 next/font/google CSS
// variables otherwise. Without this, FontPicker's per-option preview silently falls back to the
// same inherited font for every option.
const FONT_PREVIEW_CLASS = FONT_VARIABLES.join(' ');

const INPUT_CLASS =
  'w-full rounded-md border border-border bg-white px-3 py-2.5 text-sm text-gray-900 outline-none transition-colors placeholder:text-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100';

interface BrandingTabProps {
  readonly value: HotsiteBrandingResponse;
  readonly onChange: (branding: HotsiteBrandingResponse) => void;
}

export function BrandingTab({ value, onChange }: BrandingTabProps): React.JSX.Element {
  const t = useTranslations('dashboard.hotsitePage.branding');

  function setField<K extends keyof HotsiteBrandingResponse>(
    key: K,
    fieldValue: HotsiteBrandingResponse[K],
  ): void {
    onChange({ ...value, [key]: fieldValue });
  }

  return (
    <div className={`space-y-4 lg:space-y-6 ${FONT_PREVIEW_CLASS}`}>
      <SectionCard title={t('sections.colors')}>
        <BrandingColorsSection
          value={value}
          onPrimaryColorChange={(v) => setField('primaryColor', v)}
          onSecondaryColorChange={(v) => setField('secondaryColor', v)}
          onBackgroundColorChange={(v) => setField('backgroundColor', v)}
          onTextColorChange={(v) => setField('textColor', v)}
          onButtonBackgroundColorChange={(v) => setField('buttonBackgroundColor', v)}
          onButtonTextColorChange={(v) => setField('buttonTextColor', v)}
        />
      </SectionCard>

      <SectionCard title={t('sections.logo')}>
        <LogoUpload value={value.logoUrl} onChange={(logoUrl) => setField('logoUrl', logoUrl)} />
        <div>
          <label
            htmlFor="hotsite-brand-name"
            className="mb-1.5 block text-sm font-semibold text-gray-900"
          >
            {t('brandNameLabel')}
          </label>
          <input
            id="hotsite-brand-name"
            data-testid="hotsite-brand-name"
            type="text"
            maxLength={100}
            value={value.brandName ?? ''}
            onChange={(event) => setField('brandName', event.target.value || undefined)}
            className={INPUT_CLASS}
          />
        </div>
        <div>
          <label
            htmlFor="hotsite-brand-tagline"
            className="mb-1.5 block text-sm font-semibold text-gray-900"
          >
            {t('brandTaglineLabel')}
          </label>
          <input
            id="hotsite-brand-tagline"
            data-testid="hotsite-brand-tagline"
            type="text"
            maxLength={200}
            value={value.brandTagline ?? ''}
            onChange={(event) => setField('brandTagline', event.target.value || undefined)}
            className={INPUT_CLASS}
          />
        </div>
      </SectionCard>

      <SectionCard title={t('sections.typography')}>
        <div className="grid gap-4 md:grid-cols-2">
          <FontPicker
            id="hotsite-heading-font"
            label={t('headingFontLabel')}
            value={value.headingFontFamily}
            options={FONT_OPTIONS}
            onChange={(v) => setField('headingFontFamily', v)}
            searchPlaceholder={t('fontSearchPlaceholder')}
            emptyLabel={t('fontSearchEmpty')}
          />
          <FontPicker
            id="hotsite-body-font"
            label={t('bodyFontLabel')}
            value={value.bodyFontFamily}
            options={FONT_OPTIONS}
            onChange={(v) => setField('bodyFontFamily', v)}
            searchPlaceholder={t('fontSearchPlaceholder')}
            emptyLabel={t('fontSearchEmpty')}
          />
        </div>
      </SectionCard>

      <SectionCard title={t('sections.shape')}>
        <PillSelect
          label={t('borderRadiusLabel')}
          value={value.borderRadius}
          testId="hotsite-border-radius"
          options={[
            { value: 'sharp', label: t('borderRadiusSharp') },
            { value: 'rounded', label: t('borderRadiusRounded') },
            { value: 'pill', label: t('borderRadiusPill') },
          ]}
          onChange={(v) => setField('borderRadius', v)}
        />
        <PillSelect
          label={t('buttonStyleLabel')}
          value={value.buttonStyle}
          testId="hotsite-button-style"
          options={[
            { value: 'filled', label: t('buttonStyleFilled') },
            { value: 'outline', label: t('buttonStyleOutline') },
            { value: 'ghost', label: t('buttonStyleGhost') },
          ]}
          onChange={(v) => setField('buttonStyle', v)}
        />
        <PillSelect
          label={t('spacingLabel')}
          value={value.spacing}
          testId="hotsite-spacing"
          options={[
            { value: 'compact', label: t('spacingCompact') },
            { value: 'comfortable', label: t('spacingComfortable') },
            { value: 'spacious', label: t('spacingSpacious') },
          ]}
          onChange={(v) => setField('spacing', v)}
        />
        <PillSelect
          label={t('shadowStyleLabel')}
          value={value.shadowStyle}
          testId="hotsite-shadow-style"
          options={[
            { value: 'none', label: t('shadowStyleNone') },
            { value: 'subtle', label: t('shadowStyleSubtle') },
            { value: 'strong', label: t('shadowStyleStrong') },
          ]}
          onChange={(v) => setField('shadowStyle', v)}
        />
      </SectionCard>

      <SectionCard title={t('sections.rhythm')}>
        <PillSelect
          label={t('heroBgStyleLabel')}
          value={value.heroBgStyle ?? 'primary'}
          testId="hotsite-hero-bg-style"
          options={[
            { value: 'primary', label: t('heroBgStylePrimary') },
            { value: 'background', label: t('heroBgStyleBackground') },
          ]}
          onChange={(v) => setField('heroBgStyle', v)}
        />
        <SwitchField
          testId="hotsite-alternate-section-bg"
          checked={value.alternateSectionBg ?? false}
          onChange={(checked) => setField('alternateSectionBg', checked)}
          label={t('alternateSectionBgLabel')}
          hint={t('alternateSectionBgHint')}
        />
        <PillSelect
          label={t('dividerStyleLabel')}
          value={value.dividerStyle ?? 'none'}
          testId="hotsite-divider-style"
          options={[
            { value: 'none', label: t('dividerStyleNone') },
            { value: 'gradient', label: t('dividerStyleGradient') },
            { value: 'solid', label: t('dividerStyleSolid') },
          ]}
          onChange={(v) => setField('dividerStyle', v)}
        />
      </SectionCard>
    </div>
  );
}
