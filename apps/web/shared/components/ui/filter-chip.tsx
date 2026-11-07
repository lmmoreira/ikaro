import * as React from 'react';
import { cn } from '@/shared/utils/cn';

type FilterChipProps = Readonly<
  Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'aria-pressed' | 'type'> & {
    /** Whether this chip's filter is the one applied; drives `aria-pressed` and the filled look. */
    selected: boolean;
  }
>;

// A rounded toggle chip for a list's filter row ("Todos (12)", "Ativos (8)"). One chip is
// `aria-pressed`, so it reads as a toggle button, not a radio. A choice inside a form is
// `ui/pill-select` / `ui/pill-multi-select`, which carry a label and group semantics.
// Extracted from three identical per-file `buildFilterClass` copies (TD58-S12); the text colour
// and hover stay on the raw palette because the tokens differ by a shade and the screens must
// render unchanged.
export const FilterChip = React.forwardRef<HTMLButtonElement, FilterChipProps>(
  ({ selected, className, ...props }, ref) => (
    <button
      ref={ref}
      type="button"
      aria-pressed={selected}
      className={cn(
        'rounded-full border px-3.5 py-1.5 text-[0.8125rem] font-semibold transition-colors',
        selected
          ? 'border-primary bg-primary text-primary-foreground'
          : 'border-border bg-background text-gray-900 hover:bg-slate-50',
        className,
      )}
      {...props}
    />
  ),
);
FilterChip.displayName = 'FilterChip';
