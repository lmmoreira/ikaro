'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import type {
  HorizontalPosition,
  HotsiteModulePresentation,
  HotsiteModuleType,
  HotsiteSectionContentWidth,
  HotsiteSectionMinHeight,
  HotsiteSectionPadding,
  HotsiteSectionSurface,
} from '@ikaro/types';
import { PillSelect } from '@/shared/components/ui/pill-select';
import { PRESENTATION_SUPPORT } from '@/features/platform/hotsite/module-presentation';
import { SingleImageUploadField } from '../SingleImageUploadField';
import { SectionOverlayFields } from './SectionOverlayFields';
import {
  DEFAULT,
  TouchedColorPicker,
  pickOrUndefined,
  type WithDefault,
} from './presentation-field-parts';

const SURFACES: readonly HotsiteSectionSurface[] = ['background', 'secondary', 'primary', 'custom'];
const WIDTHS: readonly HotsiteSectionContentWidth[] = ['narrow', 'standard', 'wide', 'full'];
const HEIGHTS: readonly HotsiteSectionMinHeight[] = ['auto', 'sm', 'md', 'lg', 'viewport'];
const PADDINGS: readonly HotsiteSectionPadding[] = ['none', 'compact', 'comfortable', 'spacious'];
const POSITIONS: readonly HorizontalPosition[] = ['left', 'center', 'right'];

const DEFAULT_CUSTOM_COLOR = '#FFFFFF';

interface SectionPresentationFieldsProps {
  readonly moduleType: HotsiteModuleType;
  readonly value: HotsiteModulePresentation | undefined;
  readonly onChange: (presentation: HotsiteModulePresentation | undefined) => void;
}

// The shared "Section appearance" control every module panel that accepts `presentation` mounts
// (and nothing else edits it). It exposes only the closed enums and validated values of Story 1's
// contract; which of them a module may use follows PRESENTATION_SUPPORT, which mirrors the
// backend's layout rules.
export function SectionPresentationFields({
  moduleType,
  value,
  onChange,
}: SectionPresentationFieldsProps): React.JSX.Element | null {
  const t = useTranslations('dashboard.hotsitePage.layout.panels.presentation');
  // Expanded at mount when a custom appearance already exists, then purely user-controlled —
  // deriving `open` from `value` would snap the section shut the moment the last field is set
  // back to Automatic.
  const [open, setOpen] = useState(value !== undefined);
  const support = PRESENTATION_SUPPORT[moduleType];
  if (!support) return null;

  const presentation: HotsiteModulePresentation = value ?? {};
  const surfaceOnly = support === 'surface';

  // Setting a field to `undefined` removes it, and an emptied presentation is reported as none.
  function update(patch: Partial<HotsiteModulePresentation>): void {
    const next: HotsiteModulePresentation = { ...presentation, ...patch };
    for (const key of Object.keys(next) as (keyof HotsiteModulePresentation)[]) {
      if (next[key] === undefined) delete next[key];
    }
    onChange(Object.keys(next).length === 0 ? undefined : next);
  }

  const automatic = { value: DEFAULT, label: t('automatic') } as const;
  const surface = presentation.surface;
  const background = presentation.background;

  return (
    <details
      className="rounded-md border border-gray-200 p-4"
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
      data-testid="section-presentation"
    >
      <summary className="cursor-pointer text-sm font-semibold text-gray-900">{t('title')}</summary>
      <div className="mt-4 space-y-5">
        <p className="text-sm text-gray-500">{t('hint')}</p>

        <PillSelect<WithDefault<HotsiteSectionSurface>>
          label={t('surfaceLabel')}
          value={surface ?? DEFAULT}
          testId="presentation-surface"
          onChange={(next) =>
            update({
              surface: pickOrUndefined(next),
              customColor:
                next === 'custom' ? (presentation.customColor ?? DEFAULT_CUSTOM_COLOR) : undefined,
            })
          }
          options={[
            automatic,
            ...SURFACES.map((option) => ({ value: option, label: t(`surface.${option}`) })),
          ]}
        />
        {surface === 'custom' && (
          <TouchedColorPicker
            id="presentation-custom-color"
            label={t('customColorLabel')}
            value={presentation.customColor ?? ''}
            errorMessage={t('colorError')}
            onChange={(customColor) => update({ customColor })}
          />
        )}

        {!surfaceOnly && (
          <>
            <PillSelect<WithDefault<HotsiteSectionContentWidth>>
              label={t('contentWidthLabel')}
              value={presentation.contentWidth ?? DEFAULT}
              testId="presentation-content-width"
              onChange={(next) => update({ contentWidth: pickOrUndefined(next) })}
              options={[
                automatic,
                ...WIDTHS.map((option) => ({ value: option, label: t(`contentWidth.${option}`) })),
              ]}
            />
            <PillSelect<WithDefault<HotsiteSectionMinHeight>>
              label={t('minHeightLabel')}
              value={presentation.minHeight ?? DEFAULT}
              testId="presentation-min-height"
              onChange={(next) => update({ minHeight: pickOrUndefined(next) })}
              options={[
                automatic,
                ...HEIGHTS.map((option) => ({ value: option, label: t(`minHeight.${option}`) })),
              ]}
            />
            <PillSelect<WithDefault<HotsiteSectionPadding>>
              label={t('paddingLabel')}
              value={presentation.padding ?? DEFAULT}
              testId="presentation-padding"
              onChange={(next) => update({ padding: pickOrUndefined(next) })}
              options={[
                automatic,
                ...PADDINGS.map((option) => ({ value: option, label: t(`padding.${option}`) })),
              ]}
            />
          </>
        )}

        {support === 'section-with-background' && (
          <>
            <SingleImageUploadField
              id="presentation-background-image"
              value={background?.imageUrl ?? ''}
              onChange={(imageUrl) =>
                update({ background: imageUrl ? { ...background, imageUrl } : undefined })
              }
              purpose="section-background"
              previewSize="large"
              label={t('backgroundImageLabel')}
              clickToAddLabel={t('imageClickToAdd')}
              formatHintLabel={t('imageFormatHint')}
              uploadingLabel={t('imageUploading')}
              uploadErrorLabel={t('imageUploadError')}
              removeLabel={t('imageRemove')}
            />
            {background?.imageUrl && (
              <PillSelect<WithDefault<HorizontalPosition>>
                label={t('backgroundPositionLabel')}
                value={background.position ?? DEFAULT}
                testId="presentation-background-position"
                onChange={(next) =>
                  update({ background: { ...background, position: pickOrUndefined(next) } })
                }
                options={[
                  automatic,
                  ...POSITIONS.map((option) => ({
                    value: option,
                    label: t(`backgroundPosition.${option}`),
                  })),
                ]}
              />
            )}
          </>
        )}

        {!surfaceOnly && (
          <SectionOverlayFields
            overlay={presentation.overlay}
            onChange={(overlay) => update({ overlay })}
          />
        )}
      </div>
    </details>
  );
}
