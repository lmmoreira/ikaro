import * as React from 'react';
import { cn } from '@/shared/utils/cn';

type DragHandleProps = Readonly<
  Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'type' | 'aria-label'> & {
    /** The accessible name, already translated ("Arrastar para reordenar"). */
    label: string;
  }
>;

// The grip a sortable row is dragged by. It spreads whatever `@dnd-kit` hands the activator
// (`attributes`, `listeners`) onto the button, so the caller passes them as props. The default
// content is the six-dot grip; `touch-none` keeps a touch drag from scrolling the page instead.
export const DragHandle = React.forwardRef<HTMLButtonElement, DragHandleProps>(
  ({ label, className, children, ...props }, ref) => (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      className={cn(
        'cursor-grab touch-none text-subtle-foreground hover:text-gray-600 active:cursor-grabbing',
        className,
      )}
      {...props}
    >
      {children ?? (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <circle cx="9" cy="6" r="1.5" />
          <circle cx="15" cy="6" r="1.5" />
          <circle cx="9" cy="12" r="1.5" />
          <circle cx="15" cy="12" r="1.5" />
          <circle cx="9" cy="18" r="1.5" />
          <circle cx="15" cy="18" r="1.5" />
        </svg>
      )}
    </button>
  ),
);
DragHandle.displayName = 'DragHandle';
