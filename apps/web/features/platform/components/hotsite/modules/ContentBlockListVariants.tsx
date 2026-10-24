'use client';

import { useTranslations } from 'next-intl';
import type { ContentBlockProcessStepsData, ContentBlockTrustGridData } from '@ikaro/types';
import { PillSelect } from '@/shared/components/ui/pill-select';
import {
  CONTENT_BLOCK_LIMITS,
  clearEmpty,
} from '@/features/platform/hotsite/content-block-variants';
import { ListShell, RemoveButton, TextInput, replaceAt } from './ContentBlockFieldParts';

export function TrustGridFields({
  data,
  onChange,
}: {
  readonly data: ContentBlockTrustGridData;
  readonly onChange: (data: ContentBlockTrustGridData) => void;
}): React.JSX.Element {
  const t = useTranslations('dashboard.hotsitePage.layout.panels.contentBlock');
  const limits = CONTENT_BLOCK_LIMITS.trustItems;
  return (
    <>
      <PillSelect<NonNullable<ContentBlockTrustGridData['appearance']>>
        label={t('appearanceLabel')}
        value={data.appearance ?? 'rule'}
        testId="content-block-appearance"
        onChange={(appearance) => onChange({ ...data, appearance })}
        options={[
          { value: 'rule', label: t('appearanceRule') },
          { value: 'tiles', label: t('appearanceTiles') },
        ]}
      />
      <ListShell
        title={t('trustItemsLabel')}
        testId="content-block-items"
        count={data.items.length}
        min={limits.min}
        max={limits.max}
        addLabel={t('addTrustItem')}
        onAdd={() => onChange({ ...data, items: [...data.items, { label: '' }] })}
      >
        {data.items.map((item, index) => (
          <div key={index} className="space-y-2 rounded-md border border-gray-200 p-3">
            <TextInput
              id={`content-block-item-${index}-label`}
              label={t('trustItemLabel', { position: index + 1 })}
              value={item.label}
              maxLength={limits.label}
              onChange={(label) =>
                onChange({
                  ...data,
                  items: replaceAt(data.items, index, { ...item, label }),
                })
              }
            />
            <TextInput
              id={`content-block-item-${index}-description`}
              label={t('trustItemDescription', { position: index + 1 })}
              value={item.description ?? ''}
              maxLength={limits.description}
              onChange={(description) =>
                onChange({
                  ...data,
                  items: replaceAt(
                    data.items,
                    index,
                    clearEmpty({ ...item, description }, ['description']),
                  ),
                })
              }
            />
            <RemoveButton
              disabled={data.items.length <= limits.min}
              label={t('removeItem', { position: index + 1 })}
              onClick={() => onChange({ ...data, items: data.items.filter((_, i) => i !== index) })}
            />
          </div>
        ))}
      </ListShell>
    </>
  );
}

export function ProcessStepsFields({
  data,
  onChange,
}: {
  readonly data: ContentBlockProcessStepsData;
  readonly onChange: (data: ContentBlockProcessStepsData) => void;
}): React.JSX.Element {
  const t = useTranslations('dashboard.hotsitePage.layout.panels.contentBlock');
  const limits = CONTENT_BLOCK_LIMITS.steps;
  return (
    <>
      <PillSelect<NonNullable<ContentBlockProcessStepsData['appearance']>>
        label={t('appearanceLabel')}
        value={data.appearance ?? 'plain'}
        testId="content-block-appearance"
        onChange={(appearance) => onChange({ ...data, appearance })}
        options={[
          { value: 'plain', label: t('appearancePlain') },
          { value: 'ruled', label: t('appearanceRuled') },
        ]}
      />
      <ListShell
        title={t('stepsLabel')}
        testId="content-block-items"
        count={data.items.length}
        min={limits.min}
        max={limits.max}
        addLabel={t('addStep')}
        onAdd={() => onChange({ ...data, items: [...data.items, { title: '', body: '' }] })}
      >
        {data.items.map((item, index) => (
          <div key={index} className="space-y-2 rounded-md border border-gray-200 p-3">
            <TextInput
              id={`content-block-item-${index}-title`}
              label={t('stepTitle', { position: index + 1 })}
              value={item.title}
              maxLength={limits.title}
              onChange={(title) =>
                onChange({ ...data, items: replaceAt(data.items, index, { ...item, title }) })
              }
            />
            <TextInput
              id={`content-block-item-${index}-body`}
              label={t('stepBody', { position: index + 1 })}
              value={item.body}
              maxLength={limits.body}
              onChange={(body) =>
                onChange({ ...data, items: replaceAt(data.items, index, { ...item, body }) })
              }
            />
            <TextInput
              id={`content-block-item-${index}-step-label`}
              label={t('stepLabel', { position: index + 1 })}
              value={item.label ?? ''}
              maxLength={limits.label}
              onChange={(label) =>
                onChange({
                  ...data,
                  items: replaceAt(data.items, index, clearEmpty({ ...item, label }, ['label'])),
                })
              }
            />
            <RemoveButton
              disabled={data.items.length <= limits.min}
              label={t('removeItem', { position: index + 1 })}
              onClick={() => onChange({ ...data, items: data.items.filter((_, i) => i !== index) })}
            />
          </div>
        ))}
      </ListShell>
    </>
  );
}
