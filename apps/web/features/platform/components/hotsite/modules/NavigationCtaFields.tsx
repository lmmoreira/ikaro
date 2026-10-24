'use client';

import { useTranslations } from 'next-intl';
import type { NavigationModuleData } from '@ikaro/types';
import { PillSelect } from '@/shared/components/ui/pill-select';
import { SwitchField } from '@/shared/components/ui/switch-field';
import { NAVIGATION_LABEL_MAX_LENGTH } from '@/features/platform/hotsite/navigation-links';

export type NavigationCta = NonNullable<NavigationModuleData['cta']>;

const DEFAULT_CTA: NavigationCta = { label: '', target: 'booking-form' };

interface CtaFieldsProps {
  readonly cta: NavigationCta | undefined;
  readonly leadFormEnabled: boolean;
  readonly onChange: (cta: NavigationCta | undefined) => void;
}

export function NavigationCtaFields({
  cta,
  leadFormEnabled,
  onChange,
}: CtaFieldsProps): React.JSX.Element {
  const t = useTranslations('dashboard.hotsitePage.layout.panels.navigation');
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
            <label
              htmlFor="navigation-cta-label"
              className="mb-1.5 block text-sm font-semibold text-gray-900"
            >
              {t('ctaLabel')}
            </label>
            <input
              id="navigation-cta-label"
              type="text"
              value={cta.label}
              maxLength={NAVIGATION_LABEL_MAX_LENGTH}
              onChange={(event) => onChange({ ...cta, label: event.target.value })}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <PillSelect<NavigationCta['target']>
            label={t('ctaTarget')}
            value={cta.target}
            testId="navigation-cta-target"
            onChange={(target) => onChange({ ...cta, target })}
            options={[
              { value: 'booking-form', label: t('ctaTargetBooking') },
              { value: 'lead-form', label: t('ctaTargetLeadForm'), disabled: !leadFormEnabled },
            ]}
          />
          {cta.target === 'lead-form' && !leadFormEnabled && (
            <p role="note" className="rounded-md bg-amber-50 p-3 text-sm text-amber-800">
              {t('ctaLeadFormDisabled')}
            </p>
          )}
        </>
      )}
    </div>
  );
}
