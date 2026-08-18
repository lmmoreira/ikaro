'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import type { HotsiteBrandingResponse } from '@ikaro/types';
import { ColorPicker } from '@/shared/components/ui/color-picker';
import { HEX_COLOR_REGEX } from '@/shared/utils/hex-color';

type RequiredColorField = 'primaryColor' | 'secondaryColor' | 'backgroundColor' | 'textColor';
type OptionalColorField = 'buttonBackgroundColor' | 'buttonTextColor';
type ColorField = RequiredColorField | OptionalColorField;

const REQUIRED_COLOR_FIELDS = new Set<ColorField>([
  'primaryColor',
  'secondaryColor',
  'backgroundColor',
  'textColor',
]);

interface BrandingColorsSectionProps {
  readonly value: HotsiteBrandingResponse;
  readonly onPrimaryColorChange: (value: string) => void;
  readonly onSecondaryColorChange: (value: string) => void;
  readonly onBackgroundColorChange: (value: string) => void;
  readonly onTextColorChange: (value: string) => void;
  readonly onButtonBackgroundColorChange: (value: string | undefined) => void;
  readonly onButtonTextColorChange: (value: string | undefined) => void;
}

// Extracted from BrandingTab (TD37-S5A) — the touched/colorError state only ever drives these 6
// color fields, so it moves in whole rather than being threaded back through props.
export function BrandingColorsSection({
  value,
  onPrimaryColorChange,
  onSecondaryColorChange,
  onBackgroundColorChange,
  onTextColorChange,
  onButtonBackgroundColorChange,
  onButtonTextColorChange,
}: BrandingColorsSectionProps): React.JSX.Element {
  const t = useTranslations('dashboard.hotsitePage.branding');
  const [touched, setTouched] = useState<ReadonlySet<ColorField>>(new Set());

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
    <>
      <div className="grid gap-4 md:grid-cols-3">
        <ColorPicker
          id="hotsite-primary-color"
          label={t('primaryColorLabel')}
          value={value.primaryColor}
          error={colorError('primaryColor')}
          onChange={onPrimaryColorChange}
          onBlur={() => markTouched('primaryColor')}
        />
        <ColorPicker
          id="hotsite-secondary-color"
          label={t('secondaryColorLabel')}
          value={value.secondaryColor}
          error={colorError('secondaryColor')}
          onChange={onSecondaryColorChange}
          onBlur={() => markTouched('secondaryColor')}
        />
        <ColorPicker
          id="hotsite-background-color"
          label={t('backgroundColorLabel')}
          value={value.backgroundColor}
          error={colorError('backgroundColor')}
          onChange={onBackgroundColorChange}
          onBlur={() => markTouched('backgroundColor')}
        />
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <ColorPicker
          id="hotsite-text-color"
          label={t('textColorLabel')}
          value={value.textColor}
          error={colorError('textColor')}
          onChange={onTextColorChange}
          onBlur={() => markTouched('textColor')}
        />
        <ColorPicker
          id="hotsite-button-background-color"
          label={t('buttonBackgroundColorLabel')}
          value={value.buttonBackgroundColor ?? ''}
          placeholder={t('buttonBackgroundColorPlaceholder')}
          error={colorError('buttonBackgroundColor')}
          onChange={(v) => onButtonBackgroundColorChange(v || undefined)}
          onBlur={() => markTouched('buttonBackgroundColor')}
        />
        <ColorPicker
          id="hotsite-button-text-color"
          label={t('buttonTextColorLabel')}
          value={value.buttonTextColor ?? ''}
          placeholder={t('buttonTextColorPlaceholder')}
          error={colorError('buttonTextColor')}
          onChange={(v) => onButtonTextColorChange(v || undefined)}
          onBlur={() => markTouched('buttonTextColor')}
        />
      </div>
    </>
  );
}
