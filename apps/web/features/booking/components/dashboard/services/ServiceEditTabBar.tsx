'use client';

import { useTranslations } from 'next-intl';
import type { ServiceEditDirtyState, ServiceEditTabKey } from '@/features/booking/types/service';

const TABS: ServiceEditTabKey[] = ['detalhes', 'recursos', 'politicas', 'formulario'];
const TAB_LABEL_KEYS: Record<ServiceEditTabKey, string> = {
  detalhes: 'tabDetalhes',
  recursos: 'tabRecursos',
  politicas: 'tabPoliticas',
  formulario: 'tabFormulario',
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
    // overflow-y-hidden is required alongside overflow-x-auto: with one axis non-visible the
    // browser promotes the other `visible` axis to `auto`, which showed a spurious vertical
    // scrollbar (with step arrows on Linux) as soon as the tabs got narrow enough to scroll
    // horizontally. The active tab must also not overhang the box (no negative margin), or its
    // underline would be clipped now that the vertical axis is hidden.
    <div
      className="flex gap-1 overflow-x-auto overflow-y-hidden border-b border-gray-200"
      role="tablist"
    >
      {TABS.map((tab) => (
        <button
          key={tab}
          type="button"
          role="tab"
          id={`service-edit-tab-${tab}`}
          aria-controls={`service-edit-tabpanel-${tab}`}
          data-testid="service-edit-tab"
          data-tab={tab}
          aria-selected={activeTab === tab}
          onClick={() => onTabChange(tab)}
          className={`relative shrink-0 rounded-t-md border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors focus-visible:-outline-offset-2 ${
            activeTab === tab
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-900'
          }`}
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
        </button>
      ))}
    </div>
  );
}
