'use client';

import { useTranslations } from 'next-intl';

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
      <p className="text-xs font-bold uppercase tracking-[0.07em] text-gray-400">
        {t('servicesOptionsTitle')}
      </p>
      <button
        type="button"
        role="switch"
        data-testid="service-pickup-switch"
        aria-checked={checked}
        onClick={onToggle}
        className="flex w-full items-center justify-between rounded-2xl bg-slate-50 px-4 py-3 text-left transition-colors hover:bg-slate-100"
      >
        <span className="pr-4">
          <span className="block text-sm font-semibold text-gray-900">
            {t('createPickupLabel')}
          </span>
          <span className="mt-0.5 block text-sm text-gray-500">{t('createPickupHint')}</span>
        </span>
        <span
          className={`relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors ${
            checked ? 'bg-blue-600' : 'bg-slate-300'
          }`}
        >
          <span
            className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
              checked ? 'translate-x-5' : 'translate-x-0.5'
            }`}
          />
        </span>
      </button>
    </section>
  );
}
