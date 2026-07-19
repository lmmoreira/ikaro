'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import type { GalleryImage } from '@ikaro/types';
import {
  deleteHotsiteImage,
  generateHotsiteImageReadSignedUrl,
  generateHotsiteImageSignedUrl,
} from '@/features/platform/api/tenant-settings';
import { uploadFileToSignedUrl } from '@/shared/lib/upload/upload-to-signed-url';
import { compressImage } from '@/shared/utils/compress-image';
import {
  isTmpImagePath,
  resolveHotsiteImageDisplayUrl,
} from '@/features/platform/hotsite/resolve-hotsite-image-url';
import { extractProblemCode, resolveErrorMessage } from '@/shared/lib/i18n/resolve-error-message';
import { useResolvedLocale } from '@/shared/lib/i18n/use-resolved-locale';
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
// per image, keyed by that raw path (not object reference — editing the caption replaces the
// image object on every keystroke via handleCaptionChange, which would otherwise miss the cache).
export function GalleryImageManager({
  images,
  onChange,
}: GalleryImageManagerProps): React.JSX.Element {
  const t = useTranslations('dashboard.hotsitePage.layout.gallery');
  const locale = useResolvedLocale();
  const [status, setStatus] = useState<UploadStatus>('idle');
  const [uploadErrorMessage, setUploadErrorMessage] = useState<string>('');
  const [previewUrls] = useState(() => new Map<string, string>());
  const [pickerOpen, setPickerOpen] = useState(false);
  // Not-yet-promoted tmp/ images live in the private bucket — they can't resolve via the
  // public-bucket string template, so re-mounting this manager after the local blob preview is
  // gone (e.g. a tab switch) needs a fresh private signed read URL per image instead (see
  // td/TD22-ORPHANED-UPLOAD-CLEANUP.md § tmp/ image preview).
  const [remoteReadUrls, setRemoteReadUrls] = useState(() => new Map<string, string>());

  useEffect(() => {
    const unresolved = images
      .map((image) => image.url)
      .filter((url) => isTmpImagePath(url) && !previewUrls.has(url) && !remoteReadUrls.has(url));
    if (unresolved.length === 0) return;

    let cancelled = false;
    Promise.all(
      unresolved.map(async (url) => [url, await generateHotsiteImageReadSignedUrl(url)] as const),
    )
      .then((resolved) => {
        if (cancelled) return;
        setRemoteReadUrls((prev) => {
          const next = new Map(prev);
          for (const [url, res] of resolved) next.set(url, res.signedUrl);
          return next;
        });
      })
      .catch(() => {
        // best-effort — an unresolved tmp/ image just shows a broken preview until reconciled
      });
    return () => {
      cancelled = true;
    };
  }, [images, previewUrls, remoteReadUrls]);

  function displayUrl(image: GalleryImage): string {
    if (previewUrls.has(image.url)) return previewUrls.get(image.url)!;
    if (isTmpImagePath(image.url)) return remoteReadUrls.get(image.url) ?? '';
    return resolveHotsiteImageDisplayUrl(image.url);
  }

  async function handleUpload(event: React.ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    const localPreviewUrl = URL.createObjectURL(file);
    setStatus('uploading');
    try {
      const compressed = await compressImage(file);
      const filePath = await uploadFileToSignedUrl(compressed, (fileName, contentType) =>
        generateHotsiteImageSignedUrl({ fileName, contentType, purpose: 'gallery' }),
      );
      const newImage: GalleryImage = { url: filePath, source: 'upload' };
      previewUrls.set(filePath, localPreviewUrl);
      onChange([...images, newImage]);
      setStatus('idle');
    } catch (err) {
      const code = extractProblemCode(err);
      setUploadErrorMessage(code ? resolveErrorMessage(code, locale) : t('uploadErrorLabel'));
      setStatus('error');
      URL.revokeObjectURL(localPreviewUrl);
    }
  }

  function handlePicked(image: GalleryImage, previewUrl: string): void {
    previewUrls.set(image.url, previewUrl);
    onChange([...images, image]);
    setPickerOpen(false);
  }

  async function handleRemove(index: number): Promise<void> {
    const image = images[index];
    const previewUrl = previewUrls.get(image.url);
    if (previewUrl?.startsWith('blob:')) URL.revokeObjectURL(previewUrl);
    previewUrls.delete(image.url);
    if (image.url.startsWith('tenants/') || isTmpImagePath(image.url)) {
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
                data-testid="gallery-image"
                data-index={index}
                className="mb-2 aspect-square w-full rounded object-cover"
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
                data-testid="gallery-remove"
                data-index={index}
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
          {uploadErrorMessage}
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
