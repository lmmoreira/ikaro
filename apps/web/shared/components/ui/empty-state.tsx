import * as React from 'react';
import { cn } from '@/shared/utils/cn';

export interface EmptyStateProps extends Omit<
  React.ComponentPropsWithoutRef<'section'>,
  'title' | 'children'
> {
  // The icon is passed already sized and hidden from assistive tech, for example
  // `<Repeat className="h-10 w-10 text-gray-300" aria-hidden="true" />`.
  readonly icon: React.ReactNode;
  readonly title: string;
  readonly body: string;
  // Optional call to action. The caller owns its element, styling and `data-testid`.
  readonly action?: React.ReactNode;
}

// The empty list card of the customer account: icon, title, body and an optional action. It takes
// already-translated strings, so it has no copy of its own.
export function EmptyState({
  icon,
  title,
  body,
  action,
  className,
  ...props
}: Readonly<EmptyStateProps>): React.JSX.Element {
  return (
    <section
      className={cn(
        'flex flex-col items-center rounded-2xl border border-gray-100 bg-white px-6 py-12 text-center shadow-sm',
        className,
      )}
      {...props}
    >
      {icon}
      <p className="mt-4 text-base font-semibold text-gray-900">{title}</p>
      <p className="mt-1 max-w-sm text-sm text-gray-500">{body}</p>
      {action}
    </section>
  );
}
