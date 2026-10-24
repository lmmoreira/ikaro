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
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import {
  NavigationModuleDataSchema,
  type HotsiteModuleResponse,
  type HotsiteNavigationItem,
  type NavigationModuleData,
} from '@ikaro/types';
import { Button } from '@/shared/components/ui/button';
import { splitPresentation } from '@/features/platform/hotsite/module-presentation';
import {
  NAVIGATION_MAX_ITEMS,
  NAVIGATION_TARGETS,
  NAVIGATION_TARGET_MODULE,
  isModuleEnabled,
  moveNavigationItem,
} from '@/features/platform/hotsite/navigation-links';
import { NavigationCtaFields, type NavigationCta } from './NavigationCtaFields';
import {
  NavigationItemRow,
  navigationItemId,
  navigationItemIndex,
  type TargetEnabled,
} from './NavigationItemRow';
import {
  readModuleData,
  writeModuleData,
  type ModuleConfigPanelProps,
} from './module-config-panel.types';

// Targets are the same-page sections that are *enabled* in the layout: the backend refuses an
// enabled navigation that links to a disabled one, so the panel shows the others greyed out and
// explains an item whose section was turned off afterwards.
export function NavigationConfigPanel({
  data,
  onChange,
  layout,
}: ModuleConfigPanelProps): React.JSX.Element {
  const t = useTranslations('dashboard.hotsitePage.layout.panels.navigation');
  const navigation = readModuleData<NavigationModuleData>(data);
  const items = navigation.items ?? [];
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  // Without a layout (a panel rendered on its own) nothing is known to be disabled.
  const modules: readonly HotsiteModuleResponse[] | undefined = layout;
  const targetEnabled: TargetEnabled = (target) =>
    modules === undefined || isModuleEnabled(modules, NAVIGATION_TARGET_MODULE[target]);
  const firstEnabledTarget = NAVIGATION_TARGETS.find(targetEnabled) ?? NAVIGATION_TARGETS[0];

  function update(patch: Partial<NavigationModuleData>): void {
    onChange(writeModuleData({ ...navigation, ...patch }));
  }
  function setItems(next: HotsiteNavigationItem[]): void {
    update({ items: next });
  }
  function setCta(cta: NavigationCta | undefined): void {
    const next = { ...navigation, cta };
    if (!cta) delete next.cta;
    onChange(writeModuleData(next));
  }
  function handleDragEnd({ active, over }: DragEndEvent): void {
    if (!over || active.id === over.id) return;
    setItems(
      moveNavigationItem(items, navigationItemIndex(active.id), navigationItemIndex(over.id)),
    );
  }

  // An incomplete item (no label yet) cannot be applied, so the panel says why Apply does nothing.
  const incomplete = !NavigationModuleDataSchema.safeParse(splitPresentation(data).data).success;

  return (
    <div className="space-y-5">
      <p className="text-sm text-gray-500">{t('description')}</p>
      {incomplete && (
        <p
          role="note"
          data-testid="navigation-incomplete"
          className="rounded-md bg-amber-50 p-3 text-sm text-amber-800"
        >
          {t('incomplete')}
        </p>
      )}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext
          items={items.map((_, index) => navigationItemId(index))}
          strategy={verticalListSortingStrategy}
        >
          <ul className="space-y-3" data-testid="navigation-items">
            {items.map((item, index) => (
              <NavigationItemRow
                key={navigationItemId(index)}
                index={index}
                item={item}
                targetEnabled={targetEnabled}
                onChange={(next) => setItems(items.map((it, i) => (i === index ? next : it)))}
                onRemove={() => setItems(items.filter((_, i) => i !== index))}
              />
            ))}
          </ul>
        </SortableContext>
      </DndContext>
      <div className="flex items-center gap-3">
        <Button
          type="button"
          variant="outline"
          disabled={items.length >= NAVIGATION_MAX_ITEMS}
          onClick={() => setItems([...items, { label: '', target: firstEnabledTarget }])}
          data-testid="navigation-add-item"
        >
          {t('addItem')}
        </Button>
        <span className="text-sm text-gray-500" data-testid="navigation-item-count">
          {t('itemCount', { count: items.length, max: NAVIGATION_MAX_ITEMS })}
        </span>
      </div>
      <NavigationCtaFields
        cta={navigation.cta}
        leadFormEnabled={modules === undefined || isModuleEnabled(modules, 'LEAD_FORM')}
        onChange={setCta}
      />
    </div>
  );
}
