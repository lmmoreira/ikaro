'use client';

import { useTranslations } from 'next-intl';
import type { BookingCtaModuleData } from '@ikaro/types';
import { PillSelect } from '@/shared/components/ui/pill-select';
import { SingleImageUploadField } from '../SingleImageUploadField';
import {
  readModuleData,
  writeModuleData,
  type ModuleConfigPanelProps,
} from './module-config-panel.types';

// carouselDays is deliberately not exposed here — typed but unread by BookingCtaModule.tsx, and
// absent from both real production JSON examples reviewed during M13-S36 discovery.
export function BookingCtaConfigPanel({
  data,
  onChange,
}: ModuleConfigPanelProps): React.JSX.Element {
  const t = useTranslations('dashboard.hotsitePage.layout.panels.bookingCta');
  const bookingCta = readModuleData<BookingCtaModuleData>(data);

  function update(patch: Partial<BookingCtaModuleData>): void {
    onChange(writeModuleData({ ...bookingCta, ...patch }));
  }

  return (
    <div className="space-y-5">
      <div>
        <label
          htmlFor="booking-cta-title"
          className="mb-1.5 block text-sm font-semibold text-gray-900"
        >
          {t('titleLabel')}
        </label>
        <input
          id="booking-cta-title"
          type="text"
          value={bookingCta.title}
          placeholder={t('titlePlaceholder')}
          onChange={(event) => update({ title: event.target.value })}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
        />
      </div>

      <div>
        <label
          htmlFor="booking-cta-subtitle"
          className="mb-1.5 block text-sm font-semibold text-gray-900"
        >
          {t('subtitleLabel')}
        </label>
        <input
          id="booking-cta-subtitle"
          type="text"
          value={bookingCta.subtitle ?? ''}
          placeholder={t('subtitlePlaceholder')}
          onChange={(event) => update({ subtitle: event.target.value })}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
        />
      </div>

      <div>
        <label
          htmlFor="booking-cta-eyebrow"
          className="mb-1.5 block text-sm font-semibold text-gray-900"
        >
          {t('eyebrowLabel')}
        </label>
        <input
          id="booking-cta-eyebrow"
          type="text"
          value={bookingCta.eyebrow ?? ''}
          placeholder={t('eyebrowPlaceholder')}
          onChange={(event) => update({ eyebrow: event.target.value })}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
        />
      </div>

      <PillSelect
        label={t('variantLabel')}
        value={bookingCta.variant ?? 'centered'}
        onChange={(variant) => update({ variant })}
        testId="booking-cta-variant"
        options={[
          { value: 'centered', label: t('variantCentered') },
          { value: 'left-aligned', label: t('variantLeftAligned') },
        ]}
      />

      <div>
        <label
          htmlFor="booking-cta-cta-label"
          className="mb-1.5 block text-sm font-semibold text-gray-900"
        >
          {t('ctaLabelLabel')}
        </label>
        <input
          id="booking-cta-cta-label"
          type="text"
          value={bookingCta.ctaLabel}
          placeholder={t('ctaLabelPlaceholder')}
          onChange={(event) => update({ ctaLabel: event.target.value })}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
        />
      </div>

      <PillSelect
        label={t('bgStyleLabel')}
        value={bookingCta.bgStyle ?? 'primary'}
        onChange={(bgStyle) => update({ bgStyle })}
        testId="booking-cta-bg-style"
        options={[
          { value: 'primary', label: t('bgStylePrimary') },
          { value: 'background', label: t('bgStyleBackground') },
        ]}
      />

      <PillSelect
        label={t('rightPanelLabel')}
        value={bookingCta.rightPanel ?? 'none'}
        onChange={(rightPanel) => update({ rightPanel })}
        testId="booking-cta-right-panel"
        options={[
          { value: 'none', label: t('rightPanelNone') },
          { value: 'brand-card', label: t('rightPanelBrandCard') },
        ]}
      />

      <SingleImageUploadField
        id="booking-cta-background-image"
        value={bookingCta.backgroundImageUrl ?? ''}
        onChange={(backgroundImageUrl) => update({ backgroundImageUrl })}
        purpose="booking-cta"
        previewSize="large"
        label={t('backgroundImageLabel')}
        clickToAddLabel={t('backgroundImageClickToAdd')}
        formatHintLabel={t('backgroundImageFormatHint')}
        uploadingLabel={t('backgroundImageUploading')}
        uploadErrorLabel={t('backgroundImageUploadError')}
        removeLabel={t('backgroundImageRemove')}
      />
    </div>
  );
}
