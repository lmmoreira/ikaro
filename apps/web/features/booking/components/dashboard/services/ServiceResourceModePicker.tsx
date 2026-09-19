'use client';

import { useTranslations } from 'next-intl';

interface ServiceResourceModePickerProps {
  readonly mode: 'flat' | 'legs';
  // Service.setResourceRequirements() rejects (409) whenever the aggregate's own persisted
  // `legs` is non-null — legged→flat is deliberately not a supported transition via this
  // endpoint (service.aggregate.ts's own comment). Once a service was loaded with legs, the flat
  // option can never actually save, so it stays locked rather than producing a confusing 409.
  readonly legsLockedOnServer: boolean;
  readonly onSelectMode: (mode: 'flat' | 'legs') => void;
}

// Split out of ServiceResourceRequirementsPanel to stay under docs/CODE_STANDARDS.md's
// function-length limit.
export function ServiceResourceModePicker({
  mode,
  legsLockedOnServer,
  onSelectMode,
}: ServiceResourceModePickerProps): React.JSX.Element {
  const t = useTranslations('dashboard.servicesPage');

  return (
    <div>
      <label className="mb-2 block text-sm font-semibold text-gray-900">
        {t('recursosModeLabel')}
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          data-testid="resource-mode-flat"
          aria-pressed={mode === 'flat'}
          onClick={() => onSelectMode('flat')}
          disabled={legsLockedOnServer}
          className={`rounded-2xl border p-4 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
            mode === 'flat' ? 'border-blue-500 bg-blue-50' : 'border-slate-200 hover:bg-slate-50'
          }`}
        >
          <p className="text-sm font-semibold text-gray-900">{t('recursosModeFlatTitle')}</p>
          <p className="mt-0.5 text-xs text-gray-500">
            {legsLockedOnServer ? t('recursosModeFlatLockedHint') : t('recursosModeFlatSub')}
          </p>
        </button>
        <button
          type="button"
          data-testid="resource-mode-legs"
          aria-pressed={mode === 'legs'}
          onClick={() => onSelectMode('legs')}
          className={`rounded-2xl border p-4 text-left transition-colors ${
            mode === 'legs' ? 'border-blue-500 bg-blue-50' : 'border-slate-200 hover:bg-slate-50'
          }`}
        >
          <p className="text-sm font-semibold text-gray-900">{t('recursosModeLegsTitle')}</p>
          <p className="mt-0.5 text-xs text-gray-500">{t('recursosModeLegsSub')}</p>
        </button>
      </div>
    </div>
  );
}
