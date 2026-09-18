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
    <div className="flex gap-1 overflow-x-auto border-b border-gray-200" role="tablist">
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
          className={`relative shrink-0 rounded-t-md px-4 py-2.5 text-sm font-semibold transition-colors ${
            activeTab === tab
              ? '-mb-px border-b-2 border-blue-600 text-blue-600'
              : 'text-gray-500 hover:text-gray-900'
          }`}
        >
          {t(TAB_LABEL_KEYS[tab])}
          {tab !== 'formulario' && dirty[tab] && (
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
