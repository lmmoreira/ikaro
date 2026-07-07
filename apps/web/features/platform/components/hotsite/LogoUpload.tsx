'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { generateHotsiteImageSignedUrl } from '@/features/platform/tenant-settings';
import { uploadFileToSignedUrl } from '@/shared/lib/upload/upload-to-signed-url';

interface LogoUploadProps {
  readonly value: string;
  readonly onChange: (logoUrl: string) => void;
}

type UploadStatus = 'idle' | 'uploading' | 'error';

const INPUT_ID = 'hotsite-logo-upload-input';

// Single-image upload — deliberately not unified into one UI component with
// PhotoUpload.tsx/AfterServicePhotoUpload.tsx: those are multi-file galleries (append + remove),
// this replaces a single value in place, and PhotoUpload additionally renders on the public
// hotsite tree using --ba-* branding tokens (a different styling system per the "Web styling
// boundary" rule — never mixed with the dashboard's Tailwind palette used here). The actual
// duplicated part — validate → get a signed URL → PUT → return the path — is shared via
// uploadFileToSignedUrl instead. Retry-only on failure — no free-text URL fallback, since
// PATCH /tenants/hotsite only accepts a tenants/<id>/hotsite/... storage path, never an
// arbitrary external URL (see hotsite-admin.controller.ts's LOGO_URL_REGEX).
export function LogoUpload({ value, onChange }: LogoUploadProps): React.JSX.Element {
  const t = useTranslations('dashboard.hotsitePage.branding');
  const [status, setStatus] = useState<UploadStatus>('idle');
  // uploadFileToSignedUrl resolves to a bucket-relative storage path (e.g.
  // "tenants/<id>/hotsite/branding/logo.png"), not a displayable URL — only GET's resolved
  // branding.logoUrl is a full URL (HotsiteContentReader.readResolved on the backend). Preview a
  // freshly-selected file from a local blob URL instead, same pattern as
  // PhotoUpload.tsx/AfterServicePhotoUpload.tsx.
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  async function uploadFile(file: File): Promise<void> {
    // Revoke the previous blob before creating a new one — otherwise repeated logo changes in
    // the same session leak one blob URL per selection.
    if (previewUrl) URL.revokeObjectURL(previewUrl);

    const localPreviewUrl = URL.createObjectURL(file);
    setPreviewUrl(localPreviewUrl);
    setStatus('uploading');
    try {
      const filePath = await uploadFileToSignedUrl(file, (fileName, contentType) =>
        generateHotsiteImageSignedUrl({ fileName, contentType, purpose: 'branding' }),
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

  const displaySrc = previewUrl ?? value;

  return (
    <div>
      <label htmlFor={INPUT_ID} className="mb-1.5 block text-sm font-semibold text-gray-900">
        {t('logoLabel')}
      </label>

      <label
        htmlFor={INPUT_ID}
        className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed border-gray-200 bg-gray-50 px-6 py-8 text-center transition hover:border-blue-300 hover:bg-blue-50/50"
      >
        {displaySrc && status !== 'uploading' && (
          <img
            src={displaySrc}
            alt=""
            data-testid="hotsite-logo-preview"
            className="h-16 w-auto object-contain"
          />
        )}
        <p className="text-sm text-gray-600">
          {status === 'uploading' ? t('logoUploading') : t('logoClickToAdd')}
        </p>
        {status !== 'uploading' && <p className="text-xs text-gray-400">{t('logoFormatHint')}</p>}
        <input
          id={INPUT_ID}
          data-testid="hotsite-logo-upload-input"
          type="file"
          accept="image/jpeg,image/png"
          onChange={(event) => {
            void handleFileSelected(event);
          }}
          className="sr-only"
        />
      </label>

      {status === 'error' && (
        <p data-testid="hotsite-logo-upload-error" className="mt-1.5 text-sm text-red-600">
          {t('logoUploadError')}
        </p>
      )}
    </div>
  );
}
