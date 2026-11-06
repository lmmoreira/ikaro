import * as React from 'react';
import { FIELD_INVALID_CLASS } from '@/shared/components/ui/field-feedback';
import { FileInput, type FileInputProps } from '@/shared/components/ui/file-input';
import { cn } from '@/shared/utils/cn';

export interface FileDropzoneProps extends Omit<FileInputProps, 'title' | 'className'> {
  readonly title: string;
  readonly hint?: string;
  // Rendered above the title, for example the current image's preview.
  readonly preview?: React.ReactNode;
  readonly invalid?: boolean;
  // Styles the card (the `<label>`); the hidden input takes every other prop.
  readonly className?: string;
}

// The dashed "click to add a file" card. It takes already-translated strings and forwards every
// other prop (`id`, `accept`, `multiple`, `onChange`, `data-testid`, `aria-*`) to the hidden
// `FileInput` inside the label, so a click on the card opens the picker without an `htmlFor`.
export function FileDropzone({
  title,
  hint,
  preview,
  invalid = false,
  className,
  ...inputProps
}: Readonly<FileDropzoneProps>): React.JSX.Element {
  return (
    <label
      className={cn(
        'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed border-gray-200 bg-gray-50 px-6 py-8 text-center transition hover:border-blue-300 hover:bg-blue-50/50',
        invalid && FIELD_INVALID_CLASS,
        className,
      )}
    >
      {preview}
      <span className="text-sm text-gray-600">{title}</span>
      {hint && <span className="text-xs text-gray-400">{hint}</span>}
      <FileInput aria-invalid={invalid ? true : undefined} {...inputProps} />
    </label>
  );
}
