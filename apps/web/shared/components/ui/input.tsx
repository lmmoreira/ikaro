import * as React from 'react';
import { cn } from '@/shared/utils/cn';

export type InputProps = React.ComponentPropsWithoutRef<'input'>;

// Same look as `ui/textarea`. Border and background use the semantic tokens (`--input` and
// `--background` resolve to a visually equivalent value). The text, placeholder and focus colours
// stay on the palette because no token resolves to an equivalent one (`--ring` is blue-600 and
// `--muted-foreground` is far darker than gray-400); tokenise this and `ui/textarea` together.
export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type = 'text', ...props }, ref) => (
    <input
      ref={ref}
      type={type}
      className={cn(
        'flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-gray-950 shadow-sm outline-none placeholder:text-gray-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50 aria-[invalid=true]:border-red-500 aria-[invalid=true]:bg-red-50',
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = 'Input';
