'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import type { HotsiteBrandingResponse } from '@ikaro/types';
import { SectionCard } from '@/shared/components/ui/section-card';
import { ColorPicker } from '@/shared/components/ui/color-picker';
import { FontPicker, type FontPickerOption } from '@/shared/components/ui/font-picker';
import { PillSelect } from '@/shared/components/ui/pill-select';
import { SwitchField } from '@/shared/components/ui/switch-field';
import { HEX_COLOR_REGEX } from '@/shared/utils/hex-color';
import { FONT_MAP, FONT_VARIABLES } from '@/features/platform/hotsite/font-config';
import { LogoUpload } from '@/features/platform/components/hotsite/LogoUpload';

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

type RequiredColorField = 'primaryColor' | 'secondaryColor' | 'backgroundColor' | 'textColor';
type OptionalColorField = 'buttonBackgroundColor' | 'buttonTextColor';
type ColorField = RequiredColorField | OptionalColorField;

const REQUIRED_COLOR_FIELDS = new Set<ColorField>([
  'primaryColor',
  'secondaryColor',
  'backgroundColor',
  'textColor',
]);

interface BrandingTabProps {
  readonly value: HotsiteBrandingResponse;
  readonly onChange: (branding: HotsiteBrandingResponse) => void;
}

export function BrandingTab({ value, onChange }: BrandingTabProps): React.JSX.Element {
  const t = useTranslations('dashboard.hotsitePage.branding');
  const [touched, setTouched] = useState<ReadonlySet<ColorField>>(new Set());

  function setField<K extends keyof HotsiteBrandingResponse>(
    key: K,
    fieldValue: HotsiteBrandingResponse[K],
  ): void {
    onChange({ ...value, [key]: fieldValue });
  }

  function markTouched(field: ColorField): void {
    setTouched((current) => new Set(current).add(field));
  }

  function colorError(field: ColorField): string | undefined {
    if (!touched.has(field)) return undefined;
    const fieldValue = value[field] ?? '';
    if (!REQUIRED_COLOR_FIELDS.has(field) && fieldValue === '') return undefined;
    return HEX_COLOR_REGEX.test(fieldValue) ? undefined : t('colorErrorMessage');
  }

  return (
    <div className={`space-y-4 lg:space-y-6 ${FONT_PREVIEW_CLASS}`}>
      <SectionCard title={t('sections.colors')}>
        <div className="grid gap-4 md:grid-cols-3">
          <ColorPicker
            id="hotsite-primary-color"
            label={t('primaryColorLabel')}
            value={value.primaryColor}
            error={colorError('primaryColor')}
            onChange={(v) => setField('primaryColor', v)}
            onBlur={() => markTouched('primaryColor')}
          />
          <ColorPicker
            id="hotsite-secondary-color"
            label={t('secondaryColorLabel')}
            value={value.secondaryColor}
            error={colorError('secondaryColor')}
            onChange={(v) => setField('secondaryColor', v)}
            onBlur={() => markTouched('secondaryColor')}
          />
          <ColorPicker
            id="hotsite-background-color"
            label={t('backgroundColorLabel')}
            value={value.backgroundColor}
            error={colorError('backgroundColor')}
            onChange={(v) => setField('backgroundColor', v)}
            onBlur={() => markTouched('backgroundColor')}
          />
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <ColorPicker
            id="hotsite-text-color"
            label={t('textColorLabel')}
            value={value.textColor}
            error={colorError('textColor')}
            onChange={(v) => setField('textColor', v)}
            onBlur={() => markTouched('textColor')}
          />
          <ColorPicker
            id="hotsite-button-background-color"
            label={t('buttonBackgroundColorLabel')}
            value={value.buttonBackgroundColor ?? ''}
            placeholder={t('buttonBackgroundColorPlaceholder')}
            error={colorError('buttonBackgroundColor')}
            onChange={(v) => setField('buttonBackgroundColor', v || undefined)}
            onBlur={() => markTouched('buttonBackgroundColor')}
          />
          <ColorPicker
            id="hotsite-button-text-color"
            label={t('buttonTextColorLabel')}
            value={value.buttonTextColor ?? ''}
            placeholder={t('buttonTextColorPlaceholder')}
            error={colorError('buttonTextColor')}
            onChange={(v) => setField('buttonTextColor', v || undefined)}
            onBlur={() => markTouched('buttonTextColor')}
          />
        </div>
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
