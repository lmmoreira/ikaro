import { useTranslations } from 'next-intl';
import Link from 'next/link';

interface AvailabilityAlertEntryProps {
  // From buildAvailabilityAlertLink(): null means no alert can be offered (an ineligible service
  // or a basket of several services) and nothing is rendered.
  readonly href: string | null;
}

// M23-S31 — the "Avise-me quando abrir" button in the calendar step's nav row (Voltar · this ·
// Próximo). One label, no helper text, outlined in the brand colour so it reads as an action
// without competing with the filled "Próximo". It always links straight to the alert page; a
// guest meets that page's login card.
export function AvailabilityAlertEntry({
  href,
}: AvailabilityAlertEntryProps): React.JSX.Element | null {
  const t = useTranslations('booking');
  if (!href) return null;

  return (
    <Link
      href={href}
      data-testid="availability-alert-entry"
      className="cursor-pointer border px-6 py-3 font-medium transition-colors hover:opacity-80"
      style={{
        borderRadius: 'var(--ba-radius)',
        borderColor: 'var(--ba-primary)',
        color: 'var(--ba-primary)',
      }}
    >
      {t('availabilityAlert.entry.label')}
    </Link>
  );
}
