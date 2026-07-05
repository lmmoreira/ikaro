'use client';

import { useId, useState } from 'react';
import { useTranslations } from 'next-intl';
import { createCustomerAttachmentSignedUrl } from '../../api';

interface CustomerPhotoUploadProps {
  readonly bookingId: string;
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

export function CustomerPhotoUpload({
  bookingId,
  value,
  onChange,
}: CustomerPhotoUploadProps): React.JSX.Element {
  const t = useTranslations('customer.infoSubmit');
  const [items, setItems] = useState<UploadItem[]>([]);
  const inputId = useId();

  async function uploadFile(file: File): Promise<string> {
    if (!ALLOWED_CONTENT_TYPES.has(file.type)) {
      throw new Error(t('photoUnsupportedFormat'));
    }

    const contentType = file.type as 'image/jpeg' | 'image/png';
    const { signedUrl, filePath } = await createCustomerAttachmentSignedUrl(
      file.name,
      contentType,
      bookingId,
    );

    const res = await fetch(signedUrl, {
      method: 'PUT',
      headers: { 'Content-Type': contentType },
      body: file,
    });
    if (!res.ok) throw new Error(t('photoUploadFailed'));

    return filePath;
  }

  function statusLabel(status: UploadStatus): string {
    if (status === 'uploading') return t('photoUploading');
    if (status === 'done') return t('photoUploaded');
    return t('photoUploadError');
  }

  async function handleFilesSelected(event: React.ChangeEvent<HTMLInputElement>): Promise<void> {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';

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

  function handleRemove(id: string): void {
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
      <label htmlFor={inputId} className="mb-1.5 block text-sm font-semibold text-gray-900">
        {t('photoUploadTitle')}
      </label>

      <label
        htmlFor={inputId}
        className="block cursor-pointer rounded-lg border-2 border-dashed border-gray-200 p-6 text-center hover:border-gray-300"
      >
        <p className="text-sm text-gray-500">{t('photoClickToAdd')}</p>
        <p className="mt-1 text-xs text-gray-400">{t('photoFormatHint')}</p>
        <input
          id={inputId}
          type="file"
          multiple
          onChange={(event) => {
            void handleFilesSelected(event);
          }}
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
                className="aspect-square w-full rounded-lg border border-gray-100 object-cover"
              />
              <p
                className={`mt-1 truncate text-xs ${
                  item.status === 'error' ? 'font-medium text-red-600' : 'text-gray-500'
                }`}
              >
                {statusLabel(item.status)}
              </p>
              {item.status !== 'uploading' && (
                <button
                  type="button"
                  onClick={() => handleRemove(item.id)}
                  className="text-xs font-medium text-blue-600 underline"
                >
                  {t('photoRemove')}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
