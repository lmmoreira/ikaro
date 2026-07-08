'use client';

import { useTranslations } from 'next-intl';
import type { ServiceListModuleData } from '@ikaro/types';
import { PillSelect } from '@/shared/components/ui/pill-select';
import { SwitchField } from '@/shared/components/ui/switch-field';
import {
  readModuleData,
  writeModuleData,
  type ModuleConfigPanelProps,
} from './module-config-panel.types';

export function ServiceListConfigPanel({
  data,
  onChange,
}: ModuleConfigPanelProps): React.JSX.Element {
  const t = useTranslations('dashboard.hotsitePage.layout.panels.serviceList');
  const serviceList = readModuleData<ServiceListModuleData>(data);

  function update(patch: Partial<ServiceListModuleData>): void {
    onChange(writeModuleData({ ...serviceList, ...patch }));
  }

  return (
    <div className="space-y-5">
      <div>
        <label
          htmlFor="service-list-title"
          className="mb-1.5 block text-sm font-semibold text-gray-900"
        >
          {t('titleLabel')}
        </label>
        <input
          id="service-list-title"
          type="text"
          value={serviceList.title ?? ''}
          placeholder={t('titlePlaceholder')}
          onChange={(event) => update({ title: event.target.value })}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
        />
      </div>

      <div>
        <label
          htmlFor="service-list-eyebrow"
          className="mb-1.5 block text-sm font-semibold text-gray-900"
        >
          {t('eyebrowLabel')}
        </label>
        <input
          id="service-list-eyebrow"
          type="text"
          value={serviceList.eyebrow ?? ''}
          placeholder={t('eyebrowPlaceholder')}
          onChange={(event) => update({ eyebrow: event.target.value })}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
        />
      </div>

      <SwitchField
        checked={serviceList.showPrices}
        onChange={(showPrices) => update({ showPrices })}
        label={t('showPricesLabel')}
        testId="service-list-show-prices"
      />

      <SwitchField
        checked={serviceList.showPoints}
        onChange={(showPoints) => update({ showPoints })}
        label={t('showPointsLabel')}
        testId="service-list-show-points"
      />

      <PillSelect
        label={t('layoutLabel')}
        value={serviceList.layout}
        onChange={(layout) => update({ layout })}
        testId="service-list-layout"
        options={[
          { value: 'grid', label: t('layoutGrid') },
          { value: 'list', label: t('layoutList') },
        ]}
      />
    </div>
  );
}
