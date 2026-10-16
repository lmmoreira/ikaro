'use client';

import { useEffect, type ReactNode, type RefObject } from 'react';
import { ChevronDown, Filter } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Button } from '@/shared/components/ui/button';
import { cn } from '@/shared/utils/cn';
import {
  FLOATING_FILTER_CORNERS,
  popoverClassName,
  type FloatingFilterCorner,
} from '../../model/floating-filter-corner';
import { useFloatingFilterDock } from './floating-filter-dock-context';

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
  // How many options the filter currently hides; a positive number draws a badge on the trigger.
  readonly hiddenCount?: number;
  readonly hiddenCountLabel?: string;
  // The popover body between the header and the footer — each menu owns its own markup.
  readonly children: ReactNode;
}

const CORNER_LABEL_KEYS = {
  'top-left': 'positionTopLeft',
  'top-right': 'positionTopRight',
  'bottom-left': 'positionBottomLeft',
  'bottom-right': 'positionBottomRight',
} as const satisfies Record<FloatingFilterCorner, string>;

// The floating filter every dashboard page shares (Horários' status and resource filters, the
// Agenda's "Filtrar agenda"): a pill trigger and a popover with a title, a body, a "Posição" row
// and a "Padrão" / "Concluído" footer. Extracted from the two Horários menus (M23-S13) so a third
// filter is a body, not a third copy of the shell. Where it floats is not its business: the
// enclosing FloatingFilterDock owns the corner, the drag and the stacking (M23-S50).
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
  hiddenCount = 0,
  hiddenCountLabel,
  children,
}: FloatingFilterMenuProps): React.JSX.Element {
  const t = useTranslations('dashboard.floatingFilter');
  const { corner, setCorner, dragHandlers, isDragging } = useFloatingFilterDock();

  // A popover left open would ride along with the pill and re-open on the other side of the
  // screen; closing it as the drag starts matches how the page behaves without the popover.
  useEffect(() => {
    if (isDragging && open) onClose();
  }, [isDragging, open, onClose]);

  return (
    <div ref={containerRef} className="relative w-fit max-w-full">
      <Button
        type="button"
        aria-label={triggerLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        title={t('dragHandleLabel')}
        onClick={onToggleOpen}
        {...dragHandlers}
        className="h-auto w-fit cursor-grab touch-none select-none justify-between rounded-full border border-blue-500/20 bg-blue-600 px-3 py-2.5 text-left text-white shadow-lg hover:bg-blue-600/90 active:cursor-grabbing"
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
        <div
          data-testid="floating-filter-popover"
          className={cn(
            'absolute w-[min(19rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl',
            popoverClassName(corner),
          )}
        >
          <div className="px-4 py-3">
            <p className="text-sm font-semibold text-gray-900">{title}</p>
            <p className="mt-1 text-xs text-gray-500">{description}</p>
          </div>
          {children}
          <div className="border-b border-gray-100 px-4 py-3">
            <p className="text-[0.6875rem] font-bold uppercase tracking-wider text-gray-400">
              {t('positionTitle')}
            </p>
            <div
              role="group"
              aria-label={t('positionTitle')}
              className="mt-2 grid grid-cols-2 gap-1.5"
            >
              {FLOATING_FILTER_CORNERS.map((option) => (
                <Button
                  key={option}
                  type="button"
                  variant="outline"
                  size="sm"
                  aria-pressed={option === corner}
                  onClick={() => setCorner(option)}
                  className={cn(
                    'h-auto whitespace-normal px-2 py-1.5 text-xs',
                    option === corner && 'border-blue-600 bg-blue-50 text-blue-700',
                  )}
                >
                  {t(CORNER_LABEL_KEYS[option])}
                </Button>
              ))}
            </div>
          </div>
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
