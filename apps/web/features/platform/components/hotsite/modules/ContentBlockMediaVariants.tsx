'use client';

import { useTranslations } from 'next-intl';
import type {
  ContentBlockCollageCalloutData,
  ContentBlockTechnicalCalloutData,
} from '@ikaro/types';
import { PillSelect } from '@/shared/components/ui/pill-select';
import {
  CONTENT_BLOCK_LIMITS,
  clearEmpty,
} from '@/features/platform/hotsite/content-block-variants';
import { SingleImageUploadField } from '../SingleImageUploadField';
import {
  ListShell,
  RemoveButton,
  TextInput,
  replaceAt,
  useItemKeys,
} from './ContentBlockFieldParts';

export function CollageFields({
  data,
  onChange,
}: {
  readonly data: ContentBlockCollageCalloutData;
  readonly onChange: (data: ContentBlockCollageCalloutData) => void;
}): React.JSX.Element {
  const t = useTranslations('dashboard.hotsitePage.layout.panels.contentBlock');
  const limits = CONTENT_BLOCK_LIMITS.collage;
  const itemKeys = useItemKeys(data.images.length);
  return (
    <ListShell
      title={t('collageLabel')}
      testId="content-block-items"
      count={data.images.length}
      min={limits.min}
      max={limits.max}
      addLabel={t('addImage')}
      onAdd={() => {
        itemKeys.add();
        onChange({ ...data, images: [...data.images, { url: '' }] });
      }}
    >
      {data.images.map((image, index) => (
        <div key={itemKeys.keys[index]} className="space-y-2 rounded-md border border-gray-200 p-3">
          <SingleImageUploadField
            id={`content-block-image-${index}`}
            value={image.url}
            onChange={(url) =>
              onChange({ ...data, images: replaceAt(data.images, index, { ...image, url }) })
            }
            purpose="content-block"
            previewSize="small"
            label={t('imageLabel', { position: index + 1 })}
            clickToAddLabel={t('imageClickToAdd')}
            formatHintLabel={t('imageFormatHint')}
            uploadingLabel={t('imageUploading')}
            uploadErrorLabel={t('imageUploadError')}
            removeLabel={t('imageRemove')}
          />
          <TextInput
            id={`content-block-image-${index}-alt`}
            label={t('imageAlt', { position: index + 1 })}
            value={image.alt ?? ''}
            maxLength={limits.alt}
            onChange={(alt) =>
              onChange({
                ...data,
                images: replaceAt(data.images, index, clearEmpty({ ...image, alt }, ['alt'])),
              })
            }
          />
          <RemoveButton
            disabled={data.images.length <= limits.min}
            label={t('removeImage', { position: index + 1 })}
            onClick={() => {
              itemKeys.remove(index);
              onChange({ ...data, images: data.images.filter((_, i) => i !== index) });
            }}
          />
        </div>
      ))}
    </ListShell>
  );
}

export function TechnicalCalloutFields({
  data,
  onChange,
}: {
  readonly data: ContentBlockTechnicalCalloutData;
  readonly onChange: (data: ContentBlockTechnicalCalloutData) => void;
}): React.JSX.Element {
  const t = useTranslations('dashboard.hotsitePage.layout.panels.contentBlock');
  const limits = CONTENT_BLOCK_LIMITS.facts;
  const facts = data.facts ?? [];
  const itemKeys = useItemKeys(facts.length);
  return (
    <>
      <PillSelect<NonNullable<ContentBlockTechnicalCalloutData['factsPlacement']>>
        label={t('factsPlacementLabel')}
        value={data.factsPlacement ?? 'side'}
        testId="content-block-facts-placement"
        onChange={(factsPlacement) => onChange({ ...data, factsPlacement })}
        options={[
          { value: 'side', label: t('factsPlacementSide') },
          { value: 'kicker', label: t('factsPlacementKicker') },
        ]}
      />
      <ListShell
        title={t('factsLabel')}
        testId="content-block-items"
        count={facts.length}
        min={0}
        max={limits.max}
        addLabel={t('addFact')}
        onAdd={() => {
          itemKeys.add();
          onChange({ ...data, facts: [...facts, { value: '', label: '' }] });
        }}
      >
        {facts.map((fact, index) => (
          <div
            key={itemKeys.keys[index]}
            className="space-y-2 rounded-md border border-gray-200 p-3"
          >
            <TextInput
              id={`content-block-fact-${index}-value`}
              label={t('factValue', { position: index + 1 })}
              value={fact.value}
              maxLength={limits.value}
              onChange={(value) =>
                onChange({ ...data, facts: replaceAt(facts, index, { ...fact, value }) })
              }
            />
            <TextInput
              id={`content-block-fact-${index}-label`}
              label={t('factLabel', { position: index + 1 })}
              value={fact.label}
              maxLength={limits.label}
              onChange={(label) =>
                onChange({ ...data, facts: replaceAt(facts, index, { ...fact, label }) })
              }
            />
            <RemoveButton
              disabled={false}
              label={t('removeFact', { position: index + 1 })}
              onClick={() => {
                itemKeys.remove(index);
                onChange({ ...data, facts: facts.filter((_, i) => i !== index) });
              }}
            />
          </div>
        ))}
      </ListShell>
    </>
  );
}
