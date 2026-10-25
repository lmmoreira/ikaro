'use client';

import { useTranslations } from 'next-intl';
import { SERVICE_PUBLIC_PROFILE_LIMITS } from '@ikaro/types';
import { SingleImageUploadField } from '@/features/platform/components/hotsite/SingleImageUploadField';
import { SectionCard } from '@/shared/components/ui/section-card';

interface ServicePublicPageImagesProps {
  readonly cover: string;
  // '' is an empty slot (an image about to be uploaded); the draft keeps it until it is filled.
  readonly gallery: readonly string[];
  readonly onCoverChange: (path: string) => void;
  readonly onGalleryChange: (paths: string[]) => void;
  // Only managers can upload (the signed-upload endpoint is MANAGER-only): everyone else sees the
  // stored images without upload or remove controls, and the rest of the tab stays editable.
  readonly canUpload: boolean;
}

function StoredImage({ url, alt }: { readonly url: string; readonly alt: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- stored public image, the backend-resolved URL as given
    <img
      src={url}
      alt={alt}
      className="aspect-[4/3] w-full rounded-md border border-gray-200 object-cover opacity-70"
    />
  );
}

// Cover + gallery of a service's public page. The upload field is the hotsite editor's own, so a
// picture goes through the same compress → signed URL → tmp upload path; the service save moves it
// to its permanent place and deletes what was replaced (hence keepStoredOnRemove).
export function ServicePublicPageImages({
  cover,
  gallery,
  onCoverChange,
  onGalleryChange,
  canUpload,
}: ServicePublicPageImagesProps): React.JSX.Element {
  const t = useTranslations('dashboard.servicesPage');
  const max = SERVICE_PUBLIC_PROFILE_LIMITS.galleryImages;
  const filled = gallery.filter((path) => path !== '').length;

  const labels = {
    clickToAddLabel: t('publicPageImageClickToAdd'),
    formatHintLabel: t('publicPageImageFormatHint'),
    uploadingLabel: t('publicPageImageUploading'),
    uploadErrorLabel: t('publicPageImageUploadError'),
    removeLabel: t('publicPageImageRemove'),
  };

  function updateSlot(index: number, path: string): void {
    // A removed image (onChange('')) leaves no slot behind; an upload fills its slot.
    if (path === '') onGalleryChange(gallery.filter((_, slot) => slot !== index));
    else onGalleryChange(gallery.map((current, slot) => (slot === index ? path : current)));
  }

  if (!canUpload) {
    return (
      <SectionCard title={t('publicPageCoverLabel')}>
        <p role="note" data-testid="public-page-images-locked" className="text-sm text-amber-800">
          {t('publicPageImagesLockedNote')}
        </p>
        {cover && <StoredImage url={cover} alt={t('publicPageCoverLabel')} />}
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {gallery
            .filter((path) => path !== '')
            .map((path, index) => (
              <li key={`${path}-${index}`}>
                <StoredImage
                  url={path}
                  alt={t('publicPageGalleryItemLabel', { index: index + 1 })}
                />
              </li>
            ))}
        </ul>
      </SectionCard>
    );
  }

  return (
    <SectionCard title={t('publicPageCoverLabel')}>
      <SingleImageUploadField
        id="service-page-cover"
        value={cover}
        onChange={onCoverChange}
        purpose="service-profile"
        label={t('publicPageCoverLabel')}
        keepStoredOnRemove
        {...labels}
      />
      <p className="text-sm text-gray-500">{t('publicPageCoverHint')}</p>

      <div className="space-y-3">
        <p className="text-sm font-semibold text-gray-900">
          {t('publicPageGalleryLabel')}{' '}
          <span className="font-normal text-gray-500" data-testid="public-page-gallery-count">
            ({t('publicPageGalleryCount', { count: filled, max })})
          </span>
        </p>
        {gallery.map((path, index) => (
          // Keyed by slot AND path: a removal shifts the slots after it, and a field keeps its own
          // local preview, so a reused instance would show the image that used to sit there.
          <SingleImageUploadField
            key={`${index}:${path}`}
            id={`service-page-gallery-${index}`}
            value={path}
            onChange={(next) => updateSlot(index, next)}
            purpose="service-profile"
            previewSize="small"
            label={t('publicPageGalleryItemLabel', { index: index + 1 })}
            keepStoredOnRemove
            {...labels}
          />
        ))}
        <button
          type="button"
          data-testid="public-page-gallery-add"
          disabled={gallery.length >= max}
          onClick={() => onGalleryChange([...gallery, ''])}
          className="rounded-md border border-gray-200 px-4 py-2 text-sm font-semibold text-blue-600 hover:bg-blue-50 disabled:cursor-not-allowed disabled:text-gray-400 disabled:hover:bg-transparent"
        >
          {t('publicPageGalleryAdd')}
        </button>
      </div>
    </SectionCard>
  );
}
