'use client';

import { useTranslations } from 'next-intl';
import type { ServiceIntakeSchemaVersion } from '@ikaro/types';
import { Card, CardContent } from '@/shared/components/ui/card';

interface IntakeVersionHistoryCardProps {
  readonly active: ServiceIntakeSchemaVersion | null;
  readonly history: readonly ServiceIntakeSchemaVersion[];
  readonly onSelectVersion: (version: ServiceIntakeSchemaVersion) => void;
}

// Version-history rows share one static data-testid (E2E-3) — disambiguated by the sibling
// data-version attribute. Only superseded (non-active) versions are clickable/viewable (UC-054
// A1 — a past version is never editable, only ever superseded).
export function IntakeVersionHistoryCard({
  active,
  history,
  onSelectVersion,
}: IntakeVersionHistoryCardProps): React.JSX.Element | null {
  const t = useTranslations('dashboard.servicesPage');

  if (!active && history.length === 0) return null;

  return (
    <Card>
      <CardContent className="space-y-2 p-5">
        <h2 className="text-sm font-semibold text-gray-900">{t('formularioHistoryCardTitle')}</h2>
        <div data-testid="intake-version-history">
          {active && (
            <div
              data-testid="intake-version-current"
              className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2"
            >
              <span className="text-sm font-semibold text-gray-900">
                {t('formularioVersionLabel', { version: active.version })}
              </span>
              <span className="text-xs font-semibold text-green-600">
                {t('formularioHistoryCurrentBadge')}
              </span>
            </div>
          )}
          {history
            .slice()
            .sort((a, b) => b.version - a.version)
            .map((version) => (
              <button
                type="button"
                key={version.id}
                data-testid="intake-version-history-row"
                data-version={version.version}
                onClick={() => onSelectVersion(version)}
                className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left hover:bg-slate-50"
              >
                <span className="text-sm font-semibold text-gray-900">
                  {t('formularioVersionLabel', { version: version.version })}
                </span>
                <span className="text-xs text-gray-400">
                  {t('formularioHistorySupersededLabel')}
                </span>
              </button>
            ))}
        </div>
      </CardContent>
    </Card>
  );
}
