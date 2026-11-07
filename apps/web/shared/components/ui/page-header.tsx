import * as React from 'react';
import { SectionLabel } from '@/shared/components/ui/section-label';
import { cn } from '@/shared/utils/cn';

export interface PageHeaderProps extends Omit<React.ComponentPropsWithoutRef<'div'>, 'title'> {
  // An optional uppercase line above the title (a step name, a section), drawn by `SectionLabel`.
  readonly eyebrow?: string;
  // The page's visible title. It is always the page's `h1`.
  readonly title: string;
  // An optional line under the title.
  readonly description?: string;
  // An optional slot to the right of the title block (a badge, a menu, a button). The caller owns
  // its element, styling and `data-testid`.
  readonly actions?: React.ReactNode;
}

// The header of a dashboard or account page: an optional eyebrow, the `h1`, an optional
// description and an optional actions slot. It takes already-translated strings, has no copy of
// its own and draws no card chrome: a screen that shows its title inside a `Card` puts this
// inside the card. It is not the topbar title, which stays in its provider.
export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  className,
  ...props
}: Readonly<PageHeaderProps>): React.JSX.Element {
  return (
    <div className={cn('flex items-start justify-between gap-3', className)} {...props}>
      <div className="min-w-0">
        {eyebrow !== undefined && <SectionLabel>{eyebrow}</SectionLabel>}
        <h1 className={cn('text-lg font-bold text-gray-900', eyebrow !== undefined && 'mt-1')}>
          {title}
        </h1>
        {description !== undefined && <p className="mt-0.5 text-sm text-gray-500">{description}</p>}
      </div>
      {actions}
    </div>
  );
}
