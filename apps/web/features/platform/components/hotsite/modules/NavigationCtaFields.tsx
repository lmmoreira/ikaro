'use client';

import { useTranslations } from 'next-intl';
import {
  NAVIGATION_CTA_REQUIRED_MODULE,
  type NavigationCtaTarget,
  type NavigationModuleData,
} from '@ikaro/types';
import { PillSelect } from '@/shared/components/ui/pill-select';
import { SwitchField } from '@/shared/components/ui/switch-field';
import { NAVIGATION_LABEL_MAX_LENGTH } from '@/features/platform/hotsite/navigation-links';
import { Input } from '@/shared/components/ui/input';
import { Label } from '@/shared/components/ui/label';

export type NavigationCta = NonNullable<NavigationModuleData['cta']>;

const DEFAULT_CTA: NavigationCta = { label: '', target: 'booking-form' };

type CtaCopyKey = 'ctaTargetBooking' | 'ctaTargetLeadForm' | 'ctaLeadFormDisabled';

// The copy of each header-button target. Exhaustive on purpose: a target added to the shared map is
// a compile error here until it has a label (and, when it needs a module, a note for its disabled
// state). The options themselves are the map's keys, never a second list.
const CTA_TARGET_COPY: Readonly<
  Record<NavigationCtaTarget, { readonly label: CtaCopyKey; readonly disabledNote?: CtaCopyKey }>
> = {
  'booking-form': { label: 'ctaTargetBooking' },
  'lead-form': { label: 'ctaTargetLeadForm', disabledNote: 'ctaLeadFormDisabled' },
};

const CTA_TARGETS = Object.keys(NAVIGATION_CTA_REQUIRED_MODULE) as NavigationCtaTarget[];

interface CtaFieldsProps {
  readonly cta: NavigationCta | undefined;
  // Whether the module a target needs is enabled (a target that needs none always is).
  readonly isTargetEnabled: (target: NavigationCtaTarget) => boolean;
  readonly onChange: (cta: NavigationCta | undefined) => void;
}

export function NavigationCtaFields({
  cta,
  isTargetEnabled,
  onChange,
}: CtaFieldsProps): React.JSX.Element {
  const t = useTranslations('dashboard.hotsitePage.layout.panels.navigation');
  const disabledNote =
    cta && !isTargetEnabled(cta.target) ? CTA_TARGET_COPY[cta.target].disabledNote : undefined;
  return (
    <div className="space-y-4 rounded-md border border-gray-200 p-4">
      <SwitchField
        checked={cta !== undefined}
        onChange={(on) => onChange(on ? DEFAULT_CTA : undefined)}
        label={t('ctaToggle')}
        testId="navigation-cta-toggle"
      />
      <p className="text-sm text-gray-500">{t('ctaHint')}</p>
      {cta && (
        <>
          <div>
            <Label htmlFor="navigation-cta-label">{t('ctaLabel')}</Label>
            <Input
              id="navigation-cta-label"
              type="text"
              value={cta.label}
              maxLength={NAVIGATION_LABEL_MAX_LENGTH}
              onChange={(event) => onChange({ ...cta, label: event.target.value })}
            />
          </div>
          <PillSelect<NavigationCta['target']>
            label={t('ctaTarget')}
            value={cta.target}
            testId="navigation-cta-target"
            onChange={(target) => onChange({ ...cta, target })}
            options={CTA_TARGETS.map((target) => ({
              value: target,
              label: t(CTA_TARGET_COPY[target].label),
              disabled: !isTargetEnabled(target),
            }))}
          />
          {disabledNote && (
            <p role="note" className="rounded-md bg-amber-50 p-3 text-sm text-amber-800">
              {t(disabledNote)}
            </p>
          )}
        </>
      )}
    </div>
  );
}
