'use client';

import { useTranslations } from 'next-intl';
import type { HotsiteOverlayDirection, HotsiteSectionOverlay } from '@ikaro/types';
import { PillSelect } from '@/shared/components/ui/pill-select';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/components/ui/select';
import {
  DEFAULT,
  OpacityField,
  TouchedColorPicker,
  pickOrUndefined,
  type WithDefault,
} from './presentation-field-parts';

const DIRECTIONS: readonly HotsiteOverlayDirection[] = [
  'to-right',
  'to-left',
  'to-bottom',
  'to-top',
];
const OVERLAY_TYPES: readonly HotsiteSectionOverlay['type'][] = [
  'none',
  'solid',
  'linear-gradient',
];

const DEFAULT_SOLID: HotsiteSectionOverlay = { type: 'solid', color: '#000000', opacity: 0.4 };
const DEFAULT_GRADIENT: HotsiteSectionOverlay = {
  type: 'linear-gradient',
  direction: 'to-bottom',
  fromColor: '#000000',
  fromOpacity: 0,
  toColor: '#000000',
  toOpacity: 0.6,
};

function overlayOfType(type: HotsiteSectionOverlay['type']): HotsiteSectionOverlay {
  if (type === 'solid') return DEFAULT_SOLID;
  if (type === 'linear-gradient') return DEFAULT_GRADIENT;
  return { type: 'none' };
}

type Solid = Extract<HotsiteSectionOverlay, { type: 'solid' }>;
type Gradient = Extract<HotsiteSectionOverlay, { type: 'linear-gradient' }>;

function SolidFields({
  overlay,
  onChange,
}: {
  readonly overlay: Solid;
  readonly onChange: (overlay: HotsiteSectionOverlay) => void;
}): React.JSX.Element {
  const t = useTranslations('dashboard.hotsitePage.layout.panels.presentation');
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <TouchedColorPicker
        id="presentation-overlay-color"
        label={t('overlayColorLabel')}
        value={overlay.color}
        errorMessage={t('colorError')}
        onChange={(color) => onChange({ ...overlay, color })}
      />
      <OpacityField
        id="presentation-overlay-opacity"
        label={t('overlayOpacityLabel')}
        value={overlay.opacity}
        onChange={(opacity) => onChange({ ...overlay, opacity })}
      />
    </div>
  );
}

function GradientFields({
  overlay,
  onChange,
}: {
  readonly overlay: Gradient;
  readonly onChange: (overlay: HotsiteSectionOverlay) => void;
}): React.JSX.Element {
  const t = useTranslations('dashboard.hotsitePage.layout.panels.presentation');
  return (
    <div className="space-y-4">
      <div>
        <label
          htmlFor="presentation-overlay-direction"
          className="mb-1.5 block text-sm font-semibold text-gray-900"
        >
          {t('overlayDirectionLabel')}
        </label>
        <Select
          value={overlay.direction}
          onValueChange={(direction) =>
            onChange({ ...overlay, direction: direction as HotsiteOverlayDirection })
          }
        >
          <SelectTrigger
            id="presentation-overlay-direction"
            data-testid="presentation-overlay-direction"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {DIRECTIONS.map((direction) => (
              <SelectItem key={direction} value={direction}>
                {t(`overlayDirection.${direction}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <TouchedColorPicker
          id="presentation-overlay-from-color"
          label={t('overlayFromColorLabel')}
          value={overlay.fromColor}
          errorMessage={t('colorError')}
          onChange={(fromColor) => onChange({ ...overlay, fromColor })}
        />
        <OpacityField
          id="presentation-overlay-from-opacity"
          label={t('overlayFromOpacityLabel')}
          value={overlay.fromOpacity}
          onChange={(fromOpacity) => onChange({ ...overlay, fromOpacity })}
        />
        <TouchedColorPicker
          id="presentation-overlay-to-color"
          label={t('overlayToColorLabel')}
          value={overlay.toColor}
          errorMessage={t('colorError')}
          onChange={(toColor) => onChange({ ...overlay, toColor })}
        />
        <OpacityField
          id="presentation-overlay-to-opacity"
          label={t('overlayToOpacityLabel')}
          value={overlay.toOpacity}
          onChange={(toOpacity) => onChange({ ...overlay, toOpacity })}
        />
      </div>
    </div>
  );
}

interface SectionOverlayFieldsProps {
  readonly overlay: HotsiteSectionOverlay | undefined;
  readonly onChange: (overlay: HotsiteSectionOverlay | undefined) => void;
}

// The colour layer drawn over a section's background image (or tinting its surface): none, a solid
// colour, or a linear gradient. Switching type starts from a sensible value, since each shape is
// strict about which of its fields exist.
export function SectionOverlayFields({
  overlay,
  onChange,
}: SectionOverlayFieldsProps): React.JSX.Element {
  const t = useTranslations('dashboard.hotsitePage.layout.panels.presentation');
  return (
    <>
      <PillSelect<WithDefault<HotsiteSectionOverlay['type']>>
        label={t('overlayLabel')}
        value={overlay?.type ?? DEFAULT}
        testId="presentation-overlay-type"
        onChange={(next) => {
          const type = pickOrUndefined(next);
          onChange(type === undefined ? undefined : overlayOfType(type));
        }}
        options={[
          { value: DEFAULT, label: t('automatic') },
          ...OVERLAY_TYPES.map((option) => ({ value: option, label: t(`overlay.${option}`) })),
        ]}
      />
      {overlay?.type === 'solid' && <SolidFields overlay={overlay} onChange={onChange} />}
      {overlay?.type === 'linear-gradient' && (
        <GradientFields overlay={overlay} onChange={onChange} />
      )}
    </>
  );
}
