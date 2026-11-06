import * as React from 'react';
import { cn } from '@/shared/utils/cn';

export type FileInputProps = Omit<React.ComponentPropsWithoutRef<'input'>, 'type'>;

// A native `<input type="file">`, visually hidden: the visible control is the `<label>` around or
// beside it (`ui/file-dropzone`, or a button-looking label). `sr-only` keeps it focusable and
// reachable by assistive tech; pass `className` to show it.
export const FileInput = React.forwardRef<HTMLInputElement, FileInputProps>(
  ({ className, ...props }, ref) => (
    <input ref={ref} type="file" className={cn('sr-only', className)} {...props} />
  ),
);
FileInput.displayName = 'FileInput';
