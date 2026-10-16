'use client';

import type { ReactNode, RefObject } from 'react';
import { ChevronDown, Filter } from 'lucide-react';
import { Button } from '@/shared/components/ui/button';
import { cn } from '@/shared/utils/cn';

interface FloatingFilterMenuProps {
  readonly containerRef: RefObject<HTMLDivElement | null>;
  readonly open: boolean;
  readonly onToggleOpen: () => void;
  readonly onReset: () => void;
  readonly onClose: () => void;
  readonly triggerLabel: string;
  readonly title: string;
  readonly description: string;
  readonly resetLabel: string;
  readonly doneLabel: string;
  // Where the trigger floats. Several menus on one page stack by choosing different offsets.
  readonly positionClassName: string;
  // How many options the filter currently hides; a positive number draws a badge on the trigger.
  readonly hiddenCount?: number;
  readonly hiddenCountLabel?: string;
  // The popover body between the header and the footer — each menu owns its own markup.
  readonly children: ReactNode;
}

// The floating filter every dashboard page shares (Horários' status and resource filters, the
// Agenda's "Filtrar agenda"): a fixed pill trigger and a popover with a title, a body and a
// "Padrão" / "Concluído" footer. Extracted from the two Horários menus (M23-S13) so a third filter
// is a body, not a third copy of the shell.
export function FloatingFilterMenu({
  containerRef,
  open,
  onToggleOpen,
  onReset,
  onClose,
  triggerLabel,
  title,
  description,
  resetLabel,
  doneLabel,
  positionClassName,
  hiddenCount = 0,
  hiddenCountLabel,
  children,
}: FloatingFilterMenuProps): React.JSX.Element {
  return (
    <div
      ref={containerRef}
      className={cn('fixed z-30 w-fit max-w-[calc(100vw-2rem)]', positionClassName)}
    >
      <Button
        type="button"
        aria-label={triggerLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={onToggleOpen}
        className="h-auto w-fit justify-between rounded-full border border-blue-500/20 bg-blue-600 px-3 py-2.5 text-left text-white shadow-lg hover:bg-blue-600/90"
      >
        <div className="flex min-w-0 items-center gap-2">
          <Filter className="h-4 w-4 shrink-0" />
          <span className="truncate text-sm font-semibold leading-tight">{triggerLabel}</span>
          {hiddenCount > 0 ? (
            <span
              data-testid="floating-filter-hidden-count"
              aria-label={hiddenCountLabel}
              className="rounded-full bg-white/25 px-1.5 text-xs font-bold leading-5"
            >
              {hiddenCount}
            </span>
          ) : null}
        </div>
        <ChevronDown
          className={cn('h-4 w-4 shrink-0 transition-transform', open && 'rotate-180')}
        />
      </Button>

      {open ? (
        <div className="absolute bottom-full right-0 mb-3 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl">
          <div className="px-4 py-3">
            <p className="text-sm font-semibold text-gray-900">{title}</p>
            <p className="mt-1 text-xs text-gray-500">{description}</p>
          </div>
          {children}
          <div className="flex items-center justify-between gap-2 px-4 py-3">
            <Button type="button" variant="ghost" size="sm" onClick={onReset}>
              {resetLabel}
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={onClose}>
              {doneLabel}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
