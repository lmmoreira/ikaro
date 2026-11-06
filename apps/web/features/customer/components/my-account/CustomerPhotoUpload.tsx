'use client';

import { FileDropzone } from '@/shared/components/ui/file-dropzone';
import { Label } from '@/shared/components/ui/label';
import { useId, useState } from 'react';
import { useTranslations } from 'next-intl';
import { createCustomerAttachmentSignedUrl } from '@/features/booking/api/customer';
import { uploadFileToSignedUrl } from '@/shared/lib/upload/upload-to-signed-url';
import { compressImage } from '@/shared/utils/compress-image';

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

export function CustomerPhotoUpload({
  bookingId,
  value,
  onChange,
}: CustomerPhotoUploadProps): React.JSX.Element {
  const t = useTranslations('customer.infoSubmit');
  const [items, setItems] = useState<UploadItem[]>([]);
  const inputId = useId();

  async function uploadFile(file: File): Promise<string> {
    const compressed = await compressImage(file);
    return uploadFileToSignedUrl(compressed, (fileName, contentType) =>
      createCustomerAttachmentSignedUrl(fileName, contentType, bookingId),
    );
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
      <Label htmlFor={inputId}>{t('photoUploadTitle')}</Label>

      <FileDropzone
        id={inputId}
        multiple
        onChange={(event) => {
          void handleFilesSelected(event);
        }}
        title={t('photoClickToAdd')}
        hint={t('photoFormatHint')}
      />

      {items.length > 0 && (
        <ul className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
          {items.map((item) => (
            <li key={item.id}>
              {/* eslint-disable-next-line @next/next/no-img-element -- local file previews use browser object URLs before upload */}
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
