'use client';

import { Input } from '@/shared/components/ui/input';
import { Label } from '@/shared/components/ui/label';
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

const HEADING_WEIGHTS = [400, 500, 600, 700, 800, 900] as const;

function parseHeadingWeight(raw: string): (typeof HEADING_WEIGHTS)[number] | undefined {
  return HEADING_WEIGHTS.find((weight) => String(weight) === raw);
}

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
      <SectionCard title={t('sections.colors')} size="compact">
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

      <SectionCard title={t('sections.logo')} size="compact">
        <LogoUpload value={value.logoUrl} onChange={(logoUrl) => setField('logoUrl', logoUrl)} />
        <div>
          <Label htmlFor="hotsite-brand-name">{t('brandNameLabel')}</Label>
          <Input
            id="hotsite-brand-name"
            data-testid="hotsite-brand-name"
            type="text"
            maxLength={100}
            value={value.brandName ?? ''}
            onChange={(event) => setField('brandName', event.target.value || undefined)}
          />
        </div>
        <div>
          <Label htmlFor="hotsite-brand-tagline">{t('brandTaglineLabel')}</Label>
          <Input
            id="hotsite-brand-tagline"
            data-testid="hotsite-brand-tagline"
            type="text"
            maxLength={200}
            value={value.brandTagline ?? ''}
            onChange={(event) => setField('brandTagline', event.target.value || undefined)}
          />
        </div>
      </SectionCard>

      <SectionCard title={t('sections.typography')} size="compact">
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
        <PillSelect
          label={t('headingWeightLabel')}
          value={value.headingWeight === undefined ? 'auto' : String(value.headingWeight)}
          testId="hotsite-heading-weight"
          options={[
            { value: 'auto', label: t('headingWeightAuto') },
            ...HEADING_WEIGHTS.map((weight) => ({ value: String(weight), label: String(weight) })),
          ]}
          onChange={(v) =>
            setField('headingWeight', v === 'auto' ? undefined : parseHeadingWeight(v))
          }
        />
        <SwitchField
          testId="hotsite-heading-uppercase"
          checked={value.headingTransform === 'uppercase'}
          onChange={(checked) => setField('headingTransform', checked ? 'uppercase' : undefined)}
          label={t('headingUppercaseLabel')}
          hint={t('headingUppercaseHint')}
        />
      </SectionCard>

      <SectionCard title={t('sections.shape')} size="compact">
        <PillSelect
          label={t('borderRadiusLabel')}
          value={value.borderRadius}
          testId="hotsite-border-radius"
          options={[
            { value: 'sharp', label: t('borderRadiusSharp') },
            { value: 'soft', label: t('borderRadiusSoft') },
            { value: 'rounded', label: t('borderRadiusRounded') },
            { value: 'pill', label: t('borderRadiusPill') },
          ]}
          onChange={(v) => setField('borderRadius', v)}
        />
        <PillSelect
          label={t('buttonRadiusLabel')}
          value={value.buttonRadius ?? 'inherit'}
          testId="hotsite-button-radius"
          options={[
            { value: 'inherit', label: t('buttonRadiusInherit') },
            { value: 'sharp', label: t('borderRadiusSharp') },
            { value: 'rounded', label: t('borderRadiusRounded') },
            { value: 'pill', label: t('borderRadiusPill') },
          ]}
          onChange={(v) => setField('buttonRadius', v === 'inherit' ? undefined : v)}
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

      <SectionCard title={t('sections.rhythm')} size="compact">
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
