'use client';

import { useTranslations } from 'next-intl';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { HotsiteNavigationItem, HotsiteNavigationTarget } from '@ikaro/types';
import { Button } from '@/shared/components/ui/button';
import { PillSelect } from '@/shared/components/ui/pill-select';
import {
  NAVIGATION_LABEL_MAX_LENGTH,
  NAVIGATION_TARGETS,
} from '@/features/platform/hotsite/navigation-links';

export type TargetEnabled = (target: HotsiteNavigationTarget) => boolean;

// Sortable ids are positions: an item has no identity of its own, and a reorder rewrites the array.
export const navigationItemId = (index: number): string => `navigation-item-${index}`;
export const navigationItemIndex = (id: string | number): number =>
  Number(String(id).replace('navigation-item-', ''));

interface ItemRowProps {
  readonly index: number;
  readonly item: HotsiteNavigationItem;
  readonly targetEnabled: TargetEnabled;
  readonly onChange: (item: HotsiteNavigationItem) => void;
  readonly onRemove: () => void;
}

export function NavigationItemRow({
  index,
  item,
  targetEnabled,
  onChange,
  onRemove,
}: ItemRowProps): React.JSX.Element {
  const t = useTranslations('dashboard.hotsitePage.layout.panels.navigation');
  const tTargets = useTranslations('dashboard.hotsitePage.layout.panels.navigation.targets');
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: navigationItemId(index),
  });
  const position = index + 1;
  const targetIsDisabled = !targetEnabled(item.target);

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      data-testid="navigation-item"
      className={`space-y-3 rounded-md border border-gray-200 bg-white p-3 ${isDragging ? 'opacity-50' : ''}`}
    >
      <div className="flex items-end gap-3">
        <button
          type="button"
          data-testid="navigation-item-drag"
          aria-label={t('dragLabel', { position })}
          className="mb-2 cursor-grab touch-none text-gray-400 hover:text-gray-600"
          {...attributes}
          {...listeners}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <circle cx="9" cy="6" r="1.5" />
            <circle cx="15" cy="6" r="1.5" />
            <circle cx="9" cy="12" r="1.5" />
            <circle cx="15" cy="12" r="1.5" />
            <circle cx="9" cy="18" r="1.5" />
            <circle cx="15" cy="18" r="1.5" />
          </svg>
        </button>
        <div className="flex-1">
          <label
            htmlFor={`navigation-item-label-${index}`}
            className="mb-1.5 block text-sm font-semibold text-gray-900"
          >
            {t('itemLabel', { position })}
          </label>
          <input
            id={`navigation-item-label-${index}`}
            type="text"
            value={item.label}
            maxLength={NAVIGATION_LABEL_MAX_LENGTH}
            onChange={(event) => onChange({ ...item, label: event.target.value })}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onRemove}
          aria-label={t('removeItem', { position })}
          data-testid="navigation-item-remove"
        >
          {t('remove')}
        </Button>
      </div>
      <PillSelect<HotsiteNavigationTarget>
        label={t('itemTarget', { position })}
        value={item.target}
        testId={`navigation-item-target-${index}`}
        onChange={(target) => onChange({ ...item, target })}
        options={NAVIGATION_TARGETS.map((target) => ({
          value: target,
          label: tTargets(target),
          disabled: !targetEnabled(target),
        }))}
      />
      {targetIsDisabled && (
        <p
          role="note"
          data-testid="navigation-item-disabled-note"
          className="rounded-md bg-amber-50 p-3 text-sm text-amber-800"
        >
          {t('targetDisabled', { section: tTargets(item.target) })}
        </p>
      )}
    </li>
  );
}
