'use client';

import { useTranslations } from 'next-intl';
import { Card, CardContent } from '@/shared/components/ui/card';
import { ChoiceCard } from '@/shared/components/ui/choice-card';

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
    <Card>
      <CardContent className="space-y-4 p-5">
        <h2 className="text-sm font-semibold text-gray-900">{t('recursosModeLabel')}</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <ChoiceCard
            data-testid="resource-mode-flat"
            onClick={() => onSelectMode('flat')}
            disabled={legsLockedOnServer}
            selected={mode === 'flat'}
          >
            <p className="text-sm font-semibold text-gray-900">{t('recursosModeFlatTitle')}</p>
            <p className="mt-0.5 text-xs text-gray-500">
              {legsLockedOnServer ? t('recursosModeFlatLockedHint') : t('recursosModeFlatSub')}
            </p>
          </ChoiceCard>
          <ChoiceCard
            data-testid="resource-mode-legs"
            onClick={() => onSelectMode('legs')}
            selected={mode === 'legs'}
          >
            <p className="text-sm font-semibold text-gray-900">{t('recursosModeLegsTitle')}</p>
            <p className="mt-0.5 text-xs text-gray-500">{t('recursosModeLegsSub')}</p>
          </ChoiceCard>
        </div>
      </CardContent>
    </Card>
  );
}
