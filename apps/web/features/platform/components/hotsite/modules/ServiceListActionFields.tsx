'use client';

import { useTranslations } from 'next-intl';
import type {
  ServiceDetailPageSettings,
  ServiceListItemAction,
  ServiceListModuleData,
} from '@ikaro/types';
import { PillSelect } from '@/shared/components/ui/pill-select';
import { SwitchField } from '@/shared/components/ui/switch-field';
import { SERVICE_DETAIL_PAGE_DEFAULTS } from '@/features/platform/hotsite/service-detail';

// Same bound as itemCtaLabel / detailPage.bookingCtaLabel in the shared schema.
const SERVICE_ITEM_CTA_MAX_LENGTH = 40;

interface ServiceListActionFieldsProps {
  readonly serviceList: ServiceListModuleData;
  readonly update: (patch: Partial<ServiceListModuleData>) => void;
}

// What a service card does when clicked, and how every public service page looks. Shown together:
// the pages stay reachable by URL whatever the card does, so their settings are always editable.
export function ServiceListActionFields({
  serviceList,
  update,
}: ServiceListActionFieldsProps): React.JSX.Element {
  const t = useTranslations('dashboard.hotsitePage.layout.panels.serviceList');
  // An omitted detailPage renders as SERVICE_DETAIL_PAGE_DEFAULTS, so the object is only written
  // once the manager changes something, starting from those same defaults.
  const detailPage: ServiceDetailPageSettings =
    serviceList.detailPage ?? SERVICE_DETAIL_PAGE_DEFAULTS;
  function updateDetailPage(patch: Partial<ServiceDetailPageSettings>): void {
    const next = { ...detailPage, ...patch };
    if (next.bookingCtaLabel === undefined) delete next.bookingCtaLabel;
    update({ detailPage: next });
  }

  return (
    <>
      <PillSelect<ServiceListItemAction>
        label={t('itemActionLabel')}
        value={serviceList.itemAction ?? 'none'}
        onChange={(itemAction) => update({ itemAction })}
        testId="service-list-item-action"
        options={[
          { value: 'none', label: t('itemActionNone') },
          { value: 'booking', label: t('itemActionBooking') },
          { value: 'details', label: t('itemActionDetails') },
        ]}
      />
      {serviceList.itemAction === 'details' && (
        <p className="text-sm text-gray-500" data-testid="service-list-details-fallback">
          {t('itemActionDetailsHint')}
        </p>
      )}

      {(serviceList.itemAction === 'details' || serviceList.itemAction === 'booking') && (
        <div>
          <label
            htmlFor="service-list-item-cta-label"
            className="mb-1.5 block text-sm font-semibold text-gray-900"
          >
            {t('itemCtaLabel')}
          </label>
          <input
            id="service-list-item-cta-label"
            type="text"
            value={serviceList.itemCtaLabel ?? ''}
            maxLength={SERVICE_ITEM_CTA_MAX_LENGTH}
            placeholder={t('itemCtaPlaceholder')}
            onChange={(event) => update({ itemCtaLabel: event.target.value || undefined })}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
        </div>
      )}

      <fieldset className="space-y-4 rounded-md border border-gray-200 p-4">
        <legend className="px-1 text-sm font-semibold text-gray-900">
          {t('detailPageLegend')}
        </legend>
        <p className="text-sm text-gray-500">{t('detailPageHint')}</p>
        <PillSelect<ServiceDetailPageSettings['heroStyle']>
          label={t('detailHeroStyleLabel')}
          value={detailPage.heroStyle}
          onChange={(heroStyle) => updateDetailPage({ heroStyle })}
          testId="service-list-detail-hero-style"
          options={[
            { value: 'cover', label: t('detailHeroStyleCover') },
            { value: 'compact', label: t('detailHeroStyleCompact') },
          ]}
        />
        <PillSelect<ServiceDetailPageSettings['galleryLayout']>
          label={t('detailGalleryLayoutLabel')}
          value={detailPage.galleryLayout}
          onChange={(galleryLayout) => updateDetailPage({ galleryLayout })}
          testId="service-list-detail-gallery-layout"
          options={[
            { value: 'grid', label: t('detailGalleryLayoutGrid') },
            { value: 'featured', label: t('detailGalleryLayoutFeatured') },
          ]}
        />
        <SwitchField
          checked={detailPage.showPrice}
          onChange={(showPrice) => updateDetailPage({ showPrice })}
          label={t('detailShowPriceLabel')}
          testId="service-list-detail-show-price"
        />
        <SwitchField
          checked={detailPage.showDuration}
          onChange={(showDuration) => updateDetailPage({ showDuration })}
          label={t('detailShowDurationLabel')}
          testId="service-list-detail-show-duration"
        />
        <SwitchField
          checked={detailPage.showLoyaltyPoints}
          onChange={(showLoyaltyPoints) => updateDetailPage({ showLoyaltyPoints })}
          label={t('detailShowLoyaltyPointsLabel')}
          testId="service-list-detail-show-points"
        />
        <div>
          <label
            htmlFor="service-list-detail-booking-cta-label"
            className="mb-1.5 block text-sm font-semibold text-gray-900"
          >
            {t('detailBookingCtaLabel')}
          </label>
          <input
            id="service-list-detail-booking-cta-label"
            type="text"
            value={detailPage.bookingCtaLabel ?? ''}
            maxLength={SERVICE_ITEM_CTA_MAX_LENGTH}
            placeholder={t('detailBookingCtaPlaceholder')}
            onChange={(event) =>
              updateDetailPage({ bookingCtaLabel: event.target.value || undefined })
            }
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
        </div>
      </fieldset>
    </>
  );
}
