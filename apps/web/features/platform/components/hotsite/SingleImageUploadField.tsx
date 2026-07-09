'use client';

import { useEffect, useState } from 'react';
import {
  deleteHotsiteImage,
  generateHotsiteImageReadSignedUrl,
  generateHotsiteImageSignedUrl,
} from '@/features/platform/api/tenant-settings';
import { uploadFileToSignedUrl } from '@/shared/lib/upload/upload-to-signed-url';
import {
  isTmpImagePath,
  resolveHotsiteImageDisplayUrl,
} from '@/features/platform/hotsite/resolve-hotsite-image-url';

export type HotsiteImagePurpose =
  'branding' | 'hero' | 'gallery' | 'about' | 'booking-cta' | 'testimonials';

interface SingleImageUploadFieldProps {
  readonly id: string;
  readonly value: string;
  readonly onChange: (filePath: string) => void;
  readonly purpose: HotsiteImagePurpose;
  readonly previewSize?: 'small' | 'large';
  readonly label: string;
  readonly clickToAddLabel: string;
  readonly formatHintLabel: string;
  readonly uploadingLabel: string;
  readonly uploadErrorLabel: string;
  readonly removeLabel: string;
}

type UploadStatus = 'idle' | 'uploading' | 'error';

const PREVIEW_CLASS: Record<'small' | 'large', string> = {
  small: 'h-16 w-auto object-contain',
  large: 'max-h-48 w-full object-contain',
};

// Shared by every single-image field (Logo/Hero/BookingCta/About backgrounds) — the actual
// duplicated mechanic (validate → signed URL → PUT → local blob preview) lives in
// uploadFileToSignedUrl; this adds the image-lifecycle UI (preview, upload, remove) on top,
// parametrized by `purpose` and `previewSize` so Logo stays a small icon while Hero/BookingCta/
// About get a large, prominent preview matching how they actually render on the public hotsite.
export function SingleImageUploadField({
  id,
  value,
  onChange,
  purpose,
  previewSize = 'large',
  label,
  clickToAddLabel,
  formatHintLabel,
  uploadingLabel,
  uploadErrorLabel,
  removeLabel,
}: SingleImageUploadFieldProps): React.JSX.Element {
  const [status, setStatus] = useState<UploadStatus>('idle');
  // uploadFileToSignedUrl resolves to a bucket-relative storage path, not a displayable URL —
  // only a GET response's resolved *Url field is a full URL. Preview a freshly-selected file
  // from a local blob URL instead.
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  // A not-yet-promoted tmp/ upload lives in the private bucket — it can't resolve via the
  // public-bucket string template, so re-mounting this field after the local blob preview is
  // gone (e.g. a tab switch) needs a fresh private signed read URL instead (see
  // td/TD22-ORPHANED-UPLOAD-CLEANUP.md § tmp/ image preview). Tagged with the `value` it was
  // resolved for, so a stale URL from a previous tmp/ value is never rendered against a new one
  // while its own fetch is still pending — derived below, not reset via a synchronous setState
  // in the effect (see https://react.dev/learn/you-might-not-need-an-effect).
  const [remoteRead, setRemoteRead] = useState<{ value: string; url: string } | null>(null);
  const remoteReadUrl = remoteRead?.value === value ? remoteRead.url : null;

  useEffect(() => {
    // Only fetch when there's no local blob preview and the value is an unresolved tmp/ path.
    if (previewUrl || !isTmpImagePath(value)) return;
    let cancelled = false;
    generateHotsiteImageReadSignedUrl(value)
      .then((res) => {
        if (!cancelled) setRemoteRead({ value, url: res.signedUrl });
      })
      .catch(() => {
        // best-effort — an unresolved tmp/ image just shows nothing until reconciled
      });
    return () => {
      cancelled = true;
    };
  }, [value, previewUrl]);

  async function uploadFile(file: File): Promise<void> {
    if (previewUrl) URL.revokeObjectURL(previewUrl);

    const localPreviewUrl = URL.createObjectURL(file);
    setPreviewUrl(localPreviewUrl);
    setStatus('uploading');
    try {
      const filePath = await uploadFileToSignedUrl(file, (fileName, contentType) =>
        generateHotsiteImageSignedUrl({ fileName, contentType, purpose }),
      );
      onChange(filePath);
      setStatus('idle');
    } catch {
      setStatus('error');
      setPreviewUrl(null);
      URL.revokeObjectURL(localPreviewUrl);
    }
  }

  async function handleFileSelected(event: React.ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file) await uploadFile(file);
  }

  async function handleRemove(): Promise<void> {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setStatus('idle');

    // A raw "tenants/<id>/hotsite/..." (already-promoted) or "tmp/<id>/..." (not-yet-promoted)
    // storage path can actually be deleted — a resolved public URL (the shape `value` has on
    // first load, straight from GET) doesn't match the delete endpoint's path validation.
    if (value.startsWith('tenants/') || isTmpImagePath(value)) {
      try {
        await deleteHotsiteImage(value);
      } catch {
        // best-effort — the draft reference is cleared regardless; a failed bucket delete
        // just leaves an orphaned file, not a broken UI state
      }
    }

    onChange('');
  }

  // `value` is a raw storage path until the next GET resolves it — on re-opening this field
  // after a save (no fresh local blob preview), it would otherwise be passed to <img src>
  // unresolved and fail to load. See resolveHotsiteImageUrl for the full rationale. A tmp/ path
  // is private-bucket only, so it resolves via remoteReadUrl (fetched above) instead of the
  // public-bucket string template.
  const displaySrc =
    previewUrl ?? (isTmpImagePath(value) ? remoteReadUrl : resolveHotsiteImageDisplayUrl(value));

  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-semibold text-gray-900">
        {label}
      </label>

      <label
        htmlFor={id}
        className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed border-gray-200 bg-gray-50 px-6 py-8 text-center transition hover:border-blue-300 hover:bg-blue-50/50"
      >
        {displaySrc && status !== 'uploading' && (
          <img
            src={displaySrc}
            alt=""
            data-testid="single-image-upload-preview"
            data-field-id={id}
            className={PREVIEW_CLASS[previewSize]}
          />
        )}
        <p className="text-sm text-gray-600">
          {status === 'uploading' ? uploadingLabel : clickToAddLabel}
        </p>
        {status !== 'uploading' && <p className="text-xs text-gray-400">{formatHintLabel}</p>}
        <input
          id={id}
          data-testid="single-image-upload-input"
          data-field-id={id}
          type="file"
          accept="image/jpeg,image/png"
          onChange={(event) => {
            void handleFileSelected(event);
          }}
          className="sr-only"
        />
      </label>

      {status === 'error' && (
        <p
          data-testid="single-image-upload-error"
          data-field-id={id}
          className="mt-1.5 text-sm text-red-600"
        >
          {uploadErrorLabel}
        </p>
      )}

      {displaySrc && status !== 'uploading' && (
        <button
          type="button"
          data-testid="single-image-upload-remove"
          data-field-id={id}
          onClick={() => {
            void handleRemove();
          }}
          className="mt-1.5 text-sm font-semibold text-red-600 underline"
        >
          {removeLabel}
        </button>
      )}
    </div>
  );
}
