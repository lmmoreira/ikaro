'use client';

import * as React from 'react';
import { cn } from '@/shared/utils/cn';

export type TextareaProps = React.ComponentPropsWithoutRef<'textarea'>;

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        'flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm outline-none placeholder:text-subtle-foreground focus:border-ring focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  ),
);
Textarea.displayName = 'Textarea';
