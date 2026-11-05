import * as React from 'react';
import { cn } from '@/shared/utils/cn';

export type LabelProps = React.ComponentPropsWithoutRef<'label'>;

// A plain `<label>` (no Radix package): the dashboard and editor forms only need the `htmlFor`
// association and one shared look.
export const Label = React.forwardRef<HTMLLabelElement, LabelProps>(
  ({ className, htmlFor, ...props }, ref) => (
    <label
      ref={ref}
      htmlFor={htmlFor}
      className={cn('mb-1.5 block text-sm font-semibold text-gray-900', className)}
      {...props}
    />
  ),
);
Label.displayName = 'Label';
