'use client';

import { useTranslations } from 'next-intl';
import { SectionLabel } from '@/shared/components/ui/section-label';
import { SwitchField } from '@/shared/components/ui/switch-field';

interface ServicePickupSwitchProps {
  readonly checked: boolean;
  readonly onToggle: () => void;
}

// Extracted from ServiceFormFields (TD37-S5A) — a self-contained options section, unrelated to
// the input fields above it.
export function ServicePickupSwitch({
  checked,
  onToggle,
}: ServicePickupSwitchProps): React.JSX.Element {
  const t = useTranslations('dashboard.servicesPage');

  return (
    <section className="space-y-3">
      <SectionLabel>{t('servicesOptionsTitle')}</SectionLabel>
      <SwitchField
        testId="service-pickup-switch"
        checked={checked}
        onChange={onToggle}
        label={t('createPickupLabel')}
        hint={t('createPickupHint')}
      />
    </section>
  );
}
