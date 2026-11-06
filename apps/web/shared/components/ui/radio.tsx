import * as React from 'react';
import { cn } from '@/shared/utils/cn';

export type RadioProps = Omit<React.ComponentPropsWithoutRef<'input'>, 'type'>;

// A native `<input type="radio">`, so `getByRole('radio')` queries, the browser's arrow-key group
// navigation and form semantics keep working without a Radix package.
export const Radio = React.forwardRef<HTMLInputElement, RadioProps>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      type="radio"
      className={cn(
        'h-4 w-4 border-gray-300 accent-blue-600 disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  ),
);
Radio.displayName = 'Radio';
