'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { HotsiteModuleResponse, HotsiteModuleType } from '@ikaro/types';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/shared/components/ui/alert-dialog';
import { SwitchField } from '@/shared/components/ui/switch-field';
import {
  disableModuleRemovingLinks,
  hasNavigationReferences,
} from '@/features/platform/hotsite/navigation-links';

interface LayoutTabProps {
  readonly layout: readonly HotsiteModuleResponse[];
  readonly onChange: (layout: HotsiteModuleResponse[]) => void;
  readonly onConfigure: (type: HotsiteModuleType) => void;
}

// NAVIGATION is page chrome rendered above the first section (HotsiteAuthBar), so it is always the
// first entry of the layout and never moves; the backend rejects a layout where it is not first.
const PINNED_FIRST_TYPE: HotsiteModuleType = 'NAVIGATION';

// Extracted as a standalone pure function so the reorder logic is directly unit-testable without
// simulating dnd-kit's pointer-based drag gestures in jsdom (fragile and not what this function
// is responsible for verifying — dnd-kit's own test suite covers the gesture mechanics).
export function reorderLayout(
  layout: readonly HotsiteModuleResponse[],
  activeType: HotsiteModuleType,
  overType: HotsiteModuleType,
): HotsiteModuleResponse[] {
  if (activeType === overType) return [...layout];
  // A move involving the pinned module is refused outright — dragging it, or dropping anything on
  // its slot (which would place that module above it).
  if (activeType === PINNED_FIRST_TYPE || overType === PINNED_FIRST_TYPE) return [...layout];
  const oldIndex = layout.findIndex((module) => module.type === activeType);
  const newIndex = layout.findIndex((module) => module.type === overType);
  if (oldIndex === -1 || newIndex === -1) return [...layout];
  return arrayMove([...layout], oldIndex, newIndex);
}

interface LayoutRowProps {
  readonly module: HotsiteModuleResponse;
  readonly moduleLabel: string;
  readonly dragLabel: string;
  readonly configureLabel: string;
  readonly pinnedLabel: string;
  readonly onToggle: (type: HotsiteModuleType, enabled: boolean) => void;
  readonly onConfigure: (type: HotsiteModuleType) => void;
}

function LayoutRow({
  module,
  moduleLabel,
  dragLabel,
  configureLabel,
  pinnedLabel,
  onToggle,
  onConfigure,
}: LayoutRowProps): React.JSX.Element {
  const isPinned = module.type === PINNED_FIRST_TYPE;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: module.type,
    disabled: isPinned,
  });
  const style = { transform: CSS.Transform.toString(transform), transition };

  return (
    <div
      ref={setNodeRef}
      style={style}
      data-testid="layout-row"
      data-module-type={module.type}
      className={`flex items-center gap-3 rounded-md border border-gray-200 bg-white p-3 ${isDragging ? 'opacity-50' : ''}`}
    >
      {isPinned ? (
        // The page chrome the backend keeps first: no drag handle, and a lock the same size as the
        // handle so the toggles stay aligned with the draggable rows.
        <span
          role="img"
          aria-label={pinnedLabel}
          title={pinnedLabel}
          data-testid="layout-row-pinned"
          className="inline-flex w-5 justify-center text-gray-400"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <rect x="5" y="11" width="14" height="10" rx="2" />
            <path d="M8 11V7a4 4 0 0 1 8 0v4" />
          </svg>
        </span>
      ) : (
        <button
          type="button"
          data-testid="layout-row-drag"
          data-module-type={module.type}
          aria-label={dragLabel}
          className="cursor-grab touch-none text-gray-400 hover:text-gray-600"
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
      )}

      <div className="flex-1">
        <SwitchField
          checked={module.enabled}
          onChange={(checked) => onToggle(module.type, checked)}
          label={moduleLabel}
          testId={`layout-row-toggle-${module.type}`}
        />
      </div>

      <button
        type="button"
        data-testid="layout-row-configure"
        data-module-type={module.type}
        onClick={() => onConfigure(module.type)}
        className="text-sm font-semibold text-blue-600 hover:text-blue-700"
      >
        {configureLabel}
      </button>
    </div>
  );
}

export function LayoutTab({ layout, onChange, onConfigure }: LayoutTabProps): React.JSX.Element {
  const t = useTranslations('dashboard.hotsitePage.layout');
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragEnd(event: DragEndEvent): void {
    const { active, over } = event;
    if (!over) return;
    onChange(reorderLayout(layout, active.id as HotsiteModuleType, over.id as HotsiteModuleType));
  }

  // Turning off a section an enabled navigation links to would leave a dead link, which the
  // backend refuses on save, so the manager is asked first and the links go with it.
  const [pendingDisable, setPendingDisable] = useState<HotsiteModuleType | null>(null);

  function handleToggle(type: HotsiteModuleType, enabled: boolean): void {
    if (!enabled && hasNavigationReferences(layout, type)) {
      setPendingDisable(type);
      return;
    }
    onChange(layout.map((module) => (module.type === type ? { ...module, enabled } : module)));
  }

  function confirmDisable(): void {
    if (pendingDisable) onChange(disableModuleRemovingLinks(layout, pendingDisable));
    setPendingDisable(null);
  }

  return (
    <>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext
          items={layout.map((module) => module.type)}
          strategy={verticalListSortingStrategy}
        >
          <div className="space-y-2" data-testid="layout-tab-list">
            {layout.map((module) => (
              <LayoutRow
                key={module.type}
                module={module}
                moduleLabel={t(`modules.${module.type}`)}
                dragLabel={t('dragLabel', { module: t(`modules.${module.type}`) })}
                configureLabel={t('configureLabel')}
                pinnedLabel={t('pinnedLabel')}
                onToggle={handleToggle}
                onConfigure={onConfigure}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
      <AlertDialog
        open={pendingDisable !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDisable(null);
        }}
      >
        <AlertDialogContent data-testid="navigation-dependency-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>{t('navigationDependency.title')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('navigationDependency.description', {
                section: pendingDisable ? t(`modules.${pendingDisable}`) : '',
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="navigation-dependency-cancel">
              {t('navigationDependency.cancel')}
            </AlertDialogCancel>
            <AlertDialogAction onClick={confirmDisable} data-testid="navigation-dependency-confirm">
              {t('navigationDependency.confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
