'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import type React from 'react';
import { createAttachmentSignedUrl } from '@/lib/api/bookings';

interface PhotoUploadProps {
  readonly slug: string;
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
const INPUT_ID = 'photo-upload-input';

const uploadAreaStyle: React.CSSProperties = {
  border: '2px dashed var(--ba-secondary)',
  borderRadius: 'var(--ba-radius)',
};

export function PhotoUpload({ slug, value, onChange }: PhotoUploadProps): React.JSX.Element {
  const t = useTranslations('booking.photo');
  const [items, setItems] = useState<UploadItem[]>([]);

  async function uploadFile(file: File): Promise<string> {
    if (!ALLOWED_CONTENT_TYPES.has(file.type)) {
      throw new Error(t('unsupportedFormat'));
    }

    const contentType = file.type as 'image/jpeg' | 'image/png';
    const { signedUrl, filePath } = await createAttachmentSignedUrl(slug, file.name, contentType);

    const res = await fetch(signedUrl, {
      method: 'PUT',
      headers: { 'Content-Type': contentType },
      body: file,
    });
    if (!res.ok) throw new Error(t('uploadFailed'));

    return filePath;
  }

  function statusLabel(status: UploadStatus): string {
    if (status === 'uploading') return t('uploading');
    if (status === 'done') return t('uploaded');
    return t('uploadError');
  }

  async function handleFilesSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';

    let filePaths = [...value];
    for (const file of files) {
      const id = `${file.name}-${crypto.randomUUID()}`;
      const previewUrl = URL.createObjectURL(file);
      setItems((prev) => [...prev, { id, fileName: file.name, previewUrl, status: 'uploading' }]);

      try {
        const filePath = await uploadFile(file);
        filePaths = [...filePaths, filePath];
        onChange(filePaths);
        setItems((prev) =>
          prev.map((item) => (item.id === id ? { ...item, status: 'done', filePath } : item)),
        );
      } catch {
        setItems((prev) =>
          prev.map((item) => (item.id === id ? { ...item, status: 'error' } : item)),
        );
      }
    }
  }

  function handleRemove(id: string) {
    const item = items.find((i) => i.id === id);
    setItems((prev) => prev.filter((i) => i.id !== id));
    if (!item) return;

    URL.revokeObjectURL(item.previewUrl);
    if (item.filePath) {
      onChange(value.filter((filePath) => filePath !== item.filePath));
    }
  }

  return (
    <div>
      <label
        htmlFor={INPUT_ID}
        className="mb-1 block text-sm font-medium"
        style={{ color: 'var(--ba-text)' }}
      >
        {t('title')}
      </label>

      <label
        htmlFor={INPUT_ID}
        className="block cursor-pointer p-8 text-center"
        style={uploadAreaStyle}
      >
        <p className="text-sm opacity-75" style={{ color: 'var(--ba-text)' }}>
          {t('clickToAdd')}
        </p>
        <p className="mt-1 text-xs opacity-50" style={{ color: 'var(--ba-text)' }}>
          {t('formatHint')}
        </p>
        <input
          id={INPUT_ID}
          type="file"
          multiple
          onChange={handleFilesSelected}
          className="sr-only"
        />
      </label>

      {items.length > 0 && (
        <ul className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
          {items.map((item) => (
            <li key={item.id}>
              <img
                src={item.previewUrl}
                alt={item.fileName}
                className="aspect-square w-full object-cover"
                style={{ borderRadius: 'var(--ba-radius)' }}
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
                <p className="mt-1 truncate text-xs" style={{ color: 'var(--ba-text)' }}>
                  {statusLabel(item.status)}
                </p>
              )}
              {(item.status === 'done' || item.status === 'error') && (
                <button
                  type="button"
                  onClick={() => handleRemove(item.id)}
                  className="text-xs underline"
                  style={{ color: 'var(--ba-primary)' }}
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
