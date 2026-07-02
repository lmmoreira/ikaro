'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { createAttachmentSignedUrl } from '@/features/booking/api/public';

interface AfterServicePhotoUploadProps {
  readonly slug: string;
  readonly bookingId?: string;
  readonly label: string;
  readonly value: readonly string[];
  readonly onChange: (filePaths: string[]) => void;
}

type UploadStatus = 'uploading' | 'done' | 'error';

interface UploadItem {
  readonly id: string;
  readonly fileName: string;
  readonly previewUrl: string;
  readonly status: UploadStatus;
  readonly filePath?: string;
}

const ALLOWED_CONTENT_TYPES = new Set(['image/jpeg', 'image/png']);
const INPUT_ID = 'after-service-photo-upload-input';

export function AfterServicePhotoUpload({
  slug,
  bookingId,
  label,
  value,
  onChange,
}: AfterServicePhotoUploadProps): React.JSX.Element {
  const t = useTranslations('booking.photo');
  const [items, setItems] = useState<UploadItem[]>([]);

  async function uploadFile(file: File): Promise<string> {
    if (!ALLOWED_CONTENT_TYPES.has(file.type)) {
      throw new Error(t('unsupportedFormat'));
    }

    const contentType = file.type as 'image/jpeg' | 'image/png';
    const { signedUrl, filePath } = await createAttachmentSignedUrl(
      slug,
      file.name,
      contentType,
      bookingId,
    );

    const res = await fetch(signedUrl, {
      method: 'PUT',
      headers: { 'Content-Type': contentType },
      body: file,
    });

    if (!res.ok) {
      throw new Error(t('uploadFailed'));
    }

    return filePath;
  }

  function statusLabel(status: UploadStatus): string {
    if (status === 'uploading') return t('uploading');
    if (status === 'done') return t('uploaded');
    return t('uploadError');
  }

  async function handleFilesSelected(event: React.ChangeEvent<HTMLInputElement>): Promise<void> {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';

    let filePaths = [...value];
    for (const file of files) {
      const id = `${file.name}-${crypto.randomUUID()}`;
      const previewUrl = URL.createObjectURL(file);
      setItems((current) => [
        ...current,
        { id, fileName: file.name, previewUrl, status: 'uploading' },
      ]);

      try {
        const filePath = await uploadFile(file);
        filePaths = [...filePaths, filePath];
        onChange(filePaths);
        setItems((current) =>
          current.map((item) => (item.id === id ? { ...item, status: 'done', filePath } : item)),
        );
      } catch {
        setItems((current) =>
          current.map((item) => (item.id === id ? { ...item, status: 'error' } : item)),
        );
      }
    }
  }

  function handleRemove(id: string): void {
    const item = items.find((current) => current.id === id);
    setItems((current) => current.filter((currentItem) => currentItem.id !== id));
    if (!item) return;

    URL.revokeObjectURL(item.previewUrl);
    if (item.filePath) {
      onChange(value.filter((filePath) => filePath !== item.filePath));
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-sm font-semibold text-gray-900">{label}</p>

      <label
        htmlFor={INPUT_ID}
        className="block cursor-pointer rounded-2xl border-2 border-dashed border-gray-200 bg-gray-50 px-6 py-8 text-center transition hover:border-blue-300 hover:bg-blue-50/50"
      >
        <p className="text-sm font-medium text-gray-900">{t('clickToAdd')}</p>
        <p className="mt-1 text-xs text-gray-500">{t('formatHint')}</p>
        <input
          id={INPUT_ID}
          type="file"
          multiple
          aria-label={label}
          onChange={handleFilesSelected}
          className="sr-only"
        />
      </label>

      {items.length > 0 && (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {items.map((item) => (
            <li key={item.id}>
              <img
                src={item.previewUrl}
                alt={item.fileName}
                className="aspect-square w-full rounded-xl border border-gray-200 object-cover"
              />
              {item.status === 'error' ? (
                <div className="mt-1 flex items-center gap-1">
                  <svg
                    width="10"
                    height="10"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="shrink-0 text-red-600"
                    aria-hidden="true"
                  >
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="12" />
                    <line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                  <p className="truncate text-xs font-medium text-red-600">
                    {statusLabel(item.status)}
                  </p>
                </div>
              ) : (
                <p className="mt-1 truncate text-xs text-gray-600">{statusLabel(item.status)}</p>
              )}
              {(item.status === 'done' || item.status === 'error') && (
                <button
                  type="button"
                  onClick={() => handleRemove(item.id)}
                  className="text-xs font-medium text-blue-700 underline underline-offset-2"
                >
                  {t('remove')}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
