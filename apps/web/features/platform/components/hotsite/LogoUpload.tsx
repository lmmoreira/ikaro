'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { generateHotsiteImageSignedUrl } from '@/features/platform/tenant-settings';

interface LogoUploadProps {
  readonly value: string;
  readonly onChange: (logoUrl: string) => void;
}

type UploadStatus = 'idle' | 'uploading' | 'error';

const ALLOWED_CONTENT_TYPES = new Set(['image/jpeg', 'image/png']);
const INPUT_ID = 'hotsite-logo-upload-input';

// Single-image upload — deliberately not unified with PhotoUpload.tsx/AfterServicePhotoUpload.tsx
// (multi-file galleries, different signed-url endpoints/domains); this mirrors their PUT-to-
// signed-URL mechanics but stays hotsite-scoped, consistent with how those two already coexist
// without a shared abstraction. Retry-only on failure — no free-text URL fallback, since
// PATCH /tenants/hotsite only accepts a tenants/<id>/hotsite/... storage path, never an
// arbitrary external URL (see hotsite-admin.controller.ts's LOGO_URL_REGEX).
export function LogoUpload({ value, onChange }: LogoUploadProps): React.JSX.Element {
  const t = useTranslations('dashboard.hotsitePage.branding');
  const [status, setStatus] = useState<UploadStatus>('idle');

  async function uploadFile(file: File): Promise<void> {
    if (!ALLOWED_CONTENT_TYPES.has(file.type)) {
      setStatus('error');
      return;
    }

    setStatus('uploading');
    try {
      const contentType = file.type as 'image/jpeg' | 'image/png';
      const { signedUrl, filePath } = await generateHotsiteImageSignedUrl({
        fileName: file.name,
        contentType,
      });

      const res = await fetch(signedUrl, {
        method: 'PUT',
        headers: { 'Content-Type': contentType },
        body: file,
      });
      if (!res.ok) throw new Error('upload failed');

      onChange(filePath);
      setStatus('idle');
    } catch {
      setStatus('error');
    }
  }

  async function handleFileSelected(event: React.ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file) await uploadFile(file);
  }

  return (
    <div>
      <label htmlFor={INPUT_ID} className="mb-1.5 block text-sm font-semibold text-gray-900">
        {t('logoLabel')}
      </label>

      <label
        htmlFor={INPUT_ID}
        className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed border-gray-200 bg-gray-50 px-6 py-8 text-center transition hover:border-blue-300 hover:bg-blue-50/50"
      >
        {value && status !== 'uploading' && (
          <img
            src={value}
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
