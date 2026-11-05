'use client';

import * as React from 'react';
import { cn } from '@/shared/utils/cn';

export type CheckboxProps = Omit<React.ComponentPropsWithoutRef<'input'>, 'type'>;

// A native `<input type="checkbox">`, so `getByRole('checkbox')` queries, the browser's keyboard
// handling and form semantics keep working without a Radix package.
export const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      type="checkbox"
      className={cn(
        'h-4 w-4 rounded border-gray-300 accent-blue-600 disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  ),
);
Checkbox.displayName = 'Checkbox';
