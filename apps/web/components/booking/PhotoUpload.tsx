'use client';

import { useState } from 'react';
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

async function uploadFile(slug: string, file: File): Promise<string> {
  if (!ALLOWED_CONTENT_TYPES.has(file.type)) {
    throw new Error('Formato de imagem não suportado');
  }

  const contentType = file.type as 'image/jpeg' | 'image/png';
  const { signedUrl, filePath } = await createAttachmentSignedUrl(slug, file.name, contentType);

  const res = await fetch(signedUrl, {
    method: 'PUT',
    headers: { 'Content-Type': contentType },
    body: file,
  });
  if (!res.ok) throw new Error('Falha ao enviar a imagem');

  return filePath;
}

function statusLabel(status: UploadStatus): string {
  if (status === 'uploading') return 'Enviando...';
  if (status === 'done') return 'Enviada';
  return 'Erro ao enviar';
}

export function PhotoUpload({ slug, value, onChange }: PhotoUploadProps) {
  const [items, setItems] = useState<UploadItem[]>([]);

  async function handleFilesSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';

    let filePaths = [...value];
    for (const file of files) {
      const id = `${file.name}-${crypto.randomUUID()}`;
      const previewUrl = URL.createObjectURL(file);
      setItems((prev) => [...prev, { id, fileName: file.name, previewUrl, status: 'uploading' }]);

      try {
        const filePath = await uploadFile(slug, file);
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
        Fotos do veículo (opcional)
      </label>

      <label
        htmlFor={INPUT_ID}
        className="block cursor-pointer p-8 text-center"
        style={uploadAreaStyle}
      >
        <p className="text-sm opacity-75" style={{ color: 'var(--ba-text)' }}>
          Clique para adicionar fotos
        </p>
        <p className="mt-1 text-xs opacity-50" style={{ color: 'var(--ba-text)' }}>
          JPG ou PNG
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
              <p className="mt-1 truncate text-xs" style={{ color: 'var(--ba-text)' }}>
                {statusLabel(item.status)}
              </p>
              {(item.status === 'done' || item.status === 'error') && (
                <button
                  type="button"
                  onClick={() => handleRemove(item.id)}
                  className="text-xs underline"
                  style={{ color: 'var(--ba-primary)' }}
                >
                  Remover
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
