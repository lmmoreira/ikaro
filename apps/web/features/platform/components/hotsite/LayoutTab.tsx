'use client';

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
import { SwitchField } from '@/shared/components/ui/switch-field';

interface LayoutTabProps {
  readonly layout: readonly HotsiteModuleResponse[];
  readonly onChange: (layout: HotsiteModuleResponse[]) => void;
  readonly onConfigure: (type: HotsiteModuleType) => void;
}

// Extracted as a standalone pure function so the reorder logic is directly unit-testable without
// simulating dnd-kit's pointer-based drag gestures in jsdom (fragile and not what this function
// is responsible for verifying — dnd-kit's own test suite covers the gesture mechanics).
export function reorderLayout(
  layout: readonly HotsiteModuleResponse[],
  activeType: HotsiteModuleType,
  overType: HotsiteModuleType,
): HotsiteModuleResponse[] {
  if (activeType === overType) return [...layout];
  const oldIndex = layout.findIndex((module) => module.type === activeType);
  const newIndex = layout.findIndex((module) => module.type === overType);
  if (oldIndex === -1 || newIndex === -1) return [...layout];
  return arrayMove([...layout], oldIndex, newIndex);
}

interface LayoutRowProps {
  readonly module: HotsiteModuleResponse;
  readonly moduleLabel: string;
  readonly configureLabel: string;
  readonly onToggle: (type: HotsiteModuleType, enabled: boolean) => void;
  readonly onConfigure: (type: HotsiteModuleType) => void;
}

function LayoutRow({
  module,
  moduleLabel,
  configureLabel,
  onToggle,
  onConfigure,
}: LayoutRowProps): React.JSX.Element {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: module.type,
  });
  const style = { transform: CSS.Transform.toString(transform), transition };

  return (
    <div
      ref={setNodeRef}
      style={style}
      data-testid={`layout-row-${module.type}`}
      className={`flex items-center gap-3 rounded-md border border-gray-200 bg-white p-3 ${isDragging ? 'opacity-50' : ''}`}
    >
      <button
        type="button"
        data-testid={`layout-row-drag-${module.type}`}
        aria-label="drag"
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
        data-testid={`layout-row-configure-${module.type}`}
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

  function handleToggle(type: HotsiteModuleType, enabled: boolean): void {
    onChange(layout.map((module) => (module.type === type ? { ...module, enabled } : module)));
  }

  return (
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
              configureLabel={t('configureLabel')}
              onToggle={handleToggle}
              onConfigure={onConfigure}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}
