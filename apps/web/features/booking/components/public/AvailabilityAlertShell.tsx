import { useTranslations } from 'next-intl';

interface AvailabilityAlertShellProps {
  readonly children: React.ReactNode;
  readonly testId?: string;
}

// The alert page's frame — the same full-page hotsite shell the booking steps use. It explicitly
// paints --ba-background: app/[slug]/layout.tsx only defines the --ba-* variables, it never sets
// an actual background (docs/ENGINEERING_RULES_FRONTEND.md § Hotsite full-page components).
export function AvailabilityAlertShell({
  children,
  testId,
}: AvailabilityAlertShellProps): React.JSX.Element {
  const t = useTranslations('booking');

  return (
    <main
      className="min-h-screen"
      style={{ backgroundColor: 'var(--ba-background)', color: 'var(--ba-text)' }}
    >
      <div className="mx-auto max-w-2xl px-6 py-12" data-testid={testId}>
        <p className="mb-6 text-sm opacity-75">{t('availabilityAlert.stepIndicator')}</p>
        {children}
      </div>
    </main>
  );
}
