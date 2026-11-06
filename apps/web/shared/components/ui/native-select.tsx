import * as React from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/shared/utils/cn';

export type NativeSelectProps = React.ComponentPropsWithoutRef<'select'> & {
  // The chevron wrapper is what lays out in the page, so a width goes here; `className` styles the
  // `<select>` itself.
  readonly wrapperClassName?: string;
};

// shadcn's NativeSelect: a styled native `<select>`, so `selectOptions`, the mobile pickers and an
// empty `value` keep working (Radix `ui/select` cannot do any of those). The look is the shared
// field look of `ui/input` and `ui/textarea`; the height matches the `ui/select` trigger.
export const NativeSelect = React.forwardRef<HTMLSelectElement, NativeSelectProps>(
  ({ className, wrapperClassName, ...props }, ref) => (
    <div
      className={cn('relative w-full has-[select:disabled]:opacity-50', wrapperClassName)}
      data-slot="native-select-wrapper"
    >
      <select
        ref={ref}
        data-slot="native-select"
        className={cn(
          'h-9 w-full min-w-0 appearance-none rounded-md border border-input bg-background py-2 pl-3 pr-9 text-sm text-gray-950 shadow-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 disabled:cursor-not-allowed aria-[invalid=true]:border-red-500 aria-[invalid=true]:bg-red-50',
          className,
        )}
        {...props}
      />
      <ChevronDown
        className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500 opacity-70"
        aria-hidden="true"
        data-slot="native-select-icon"
      />
    </div>
  ),
);
NativeSelect.displayName = 'NativeSelect';
