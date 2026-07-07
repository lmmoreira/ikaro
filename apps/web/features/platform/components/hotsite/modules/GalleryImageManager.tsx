'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import type { GalleryImage } from '@ikaro/types';
import {
  deleteHotsiteImage,
  generateHotsiteImageSignedUrl,
} from '@/features/platform/tenant-settings';
import { uploadFileToSignedUrl } from '@/shared/lib/upload/upload-to-signed-url';
import { BookingPhotoPicker } from './BookingPhotoPicker';

interface GalleryImageManagerProps {
  readonly images: readonly GalleryImage[];
  readonly onChange: (images: GalleryImage[]) => void;
}

type UploadStatus = 'idle' | 'uploading' | 'error';

const INPUT_ID = 'hotsite-gallery-upload-input';

// GalleryImage.url is stored as a raw "tenants/<id>/hotsite/..." storage path (same convention
// as branding.logoUrl / module backgroundImageUrl — see HotsiteImageUrlResolver, which resolves
// every one of these fields into a public URL uniformly at GET-time, gallery images included).
// A freshly added image (upload or booking-feature) therefore has a raw path as its `url` in the
// draft, which isn't directly displayable — previewUrls tracks a locally-known displayable URL
// per image (by object reference) until the next GET resolves it for real.
export function GalleryImageManager({
  images,
  onChange,
}: GalleryImageManagerProps): React.JSX.Element {
  const t = useTranslations('dashboard.hotsitePage.layout.gallery');
  const [status, setStatus] = useState<UploadStatus>('idle');
  const [previewUrls] = useState(() => new Map<GalleryImage, string>());
  const [pickerOpen, setPickerOpen] = useState(false);

  function displayUrl(image: GalleryImage): string {
    return previewUrls.get(image) ?? image.url;
  }

  async function handleUpload(event: React.ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    const localPreviewUrl = URL.createObjectURL(file);
    setStatus('uploading');
    try {
      const filePath = await uploadFileToSignedUrl(file, (fileName, contentType) =>
        generateHotsiteImageSignedUrl({ fileName, contentType, purpose: 'gallery' }),
      );
      const newImage: GalleryImage = { url: filePath, source: 'upload' };
      previewUrls.set(newImage, localPreviewUrl);
      onChange([...images, newImage]);
      setStatus('idle');
    } catch {
      setStatus('error');
      URL.revokeObjectURL(localPreviewUrl);
    }
  }

  function handlePicked(image: GalleryImage, previewUrl: string): void {
    previewUrls.set(image, previewUrl);
    onChange([...images, image]);
    setPickerOpen(false);
  }

  async function handleRemove(index: number): Promise<void> {
    const image = images[index];
    previewUrls.delete(image);
    if (image.url.startsWith('tenants/')) {
      try {
        await deleteHotsiteImage(image.url);
      } catch {
        // best-effort — the draft reference is cleared regardless
      }
    }
    onChange(images.filter((_, i) => i !== index));
  }

  function handleCaptionChange(index: number, caption: string): void {
    onChange(images.map((img, i) => (i === index ? { ...img, caption } : img)));
  }

  return (
    <div>
      {images.length === 0 && (
        <p data-testid="gallery-empty" className="mb-3 text-sm text-gray-500">
          {t('emptyLabel')}
        </p>
      )}

      {images.length > 0 && (
        <div data-testid="gallery-grid" className="mb-3 grid grid-cols-3 gap-3">
          {images.map((image, index) => (
            <div key={`${image.url}-${index}`} className="rounded-md border border-gray-200 p-2">
              <img
                src={displayUrl(image)}
                alt=""
                data-testid={`gallery-image-${index}`}
                className="mb-2 h-24 w-full rounded object-cover"
              />
              <input
                type="text"
                value={image.caption ?? ''}
                placeholder={t('captionPlaceholder')}
                onChange={(event) => handleCaptionChange(index, event.target.value)}
                className="mb-2 w-full rounded border border-gray-300 px-2 py-1 text-xs"
              />
              <button
                type="button"
                data-testid={`gallery-remove-${index}`}
                onClick={() => {
                  void handleRemove(index);
                }}
                className="text-xs font-semibold text-red-600 underline"
              >
                {t('removeLabel')}
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <label
          htmlFor={INPUT_ID}
          className="cursor-pointer rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          {status === 'uploading' ? t('uploadingLabel') : t('addUploadLabel')}
        </label>
        <input
          id={INPUT_ID}
          data-testid="gallery-upload-input"
          type="file"
          accept="image/jpeg,image/png"
          onChange={(event) => {
            void handleUpload(event);
          }}
          className="sr-only"
        />
        <button
          type="button"
          data-testid="gallery-open-picker"
          onClick={() => setPickerOpen(true)}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          {t('addFromBookingLabel')}
        </button>
      </div>

      {status === 'error' && (
        <p data-testid="gallery-upload-error" className="mt-1.5 text-sm text-red-600">
          {t('uploadErrorLabel')}
        </p>
      )}

      {pickerOpen && (
        <div className="mt-3">
          <BookingPhotoPicker onPick={handlePicked} onClose={() => setPickerOpen(false)} />
        </div>
      )}
    </div>
  );
}
