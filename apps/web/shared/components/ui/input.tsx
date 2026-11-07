import * as React from 'react';
import { cn } from '@/shared/utils/cn';

export type InputProps = React.ComponentPropsWithoutRef<'input'>;

// Same look as `ui/textarea`, on the semantic tokens only (`app/globals.css`).
export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type = 'text', ...props }, ref) => (
    <input
      ref={ref}
      type={type}
      className={cn(
        'flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm outline-none placeholder:text-subtle-foreground focus:border-ring focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50 aria-[invalid=true]:border-destructive aria-[invalid=true]:bg-destructive-tint',
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = 'Input';
