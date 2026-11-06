'use client';

import { useTranslations } from 'next-intl';
import { Tabs, TabsList, TabsTrigger } from '@/shared/components/ui/tabs';
import type { ServiceEditDirtyState, ServiceEditTabKey } from '@/features/booking/types/service';

const TABS: ServiceEditTabKey[] = ['detalhes', 'recursos', 'politicas', 'formulario', 'pagina'];
const TAB_LABEL_KEYS: Record<ServiceEditTabKey, string> = {
  detalhes: 'tabDetalhes',
  recursos: 'tabRecursos',
  politicas: 'tabPoliticas',
  formulario: 'tabFormulario',
  pagina: 'tabPaginaPublica',
};

interface ServiceEditTabBarProps {
  readonly activeTab: ServiceEditTabKey;
  readonly dirty: ServiceEditDirtyState;
  readonly onTabChange: (tab: ServiceEditTabKey) => void;
}

export function ServiceEditTabBar({
  activeTab,
  dirty,
  onTabChange,
}: ServiceEditTabBarProps): React.JSX.Element {
  const t = useTranslations('dashboard.servicesPage');

  return (
    <Tabs value={activeTab} onValueChange={(value) => onTabChange(value as ServiceEditTabKey)}>
      {/* overflow-y-hidden is required alongside overflow-x-auto: with one axis non-visible the
          browser promotes the other `visible` axis to `auto`, which showed a spurious vertical
          scrollbar (with step arrows on Linux) as soon as the tabs got narrow enough to scroll
          horizontally. The active tab must also not overhang the box (no negative margin), or its
          underline would be clipped now that the vertical axis is hidden. */}
      <TabsList className="overflow-x-auto overflow-y-hidden">
        {TABS.map((tab) => (
          <TabsTrigger
            key={tab}
            value={tab}
            // The panels are separate components that own their `role="tabpanel"` and these ids
            // (ServiceEditDetailsTab, ServiceEditConfigTabPanels), so the trigger points at them.
            id={`service-edit-tab-${tab}`}
            aria-controls={`service-edit-tabpanel-${tab}`}
            data-testid="service-edit-tab"
            data-tab={tab}
            className="focus-visible:-outline-offset-2"
          >
            {t(TAB_LABEL_KEYS[tab])}
            {dirty[tab] && (
              <span
                data-testid="service-edit-tab-dirty-dot"
                data-tab={tab}
                aria-hidden="true"
                className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-amber-500"
              />
            )}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
