import { useTranslations } from 'next-intl';

const btnStyle: React.CSSProperties = {
  backgroundColor: 'var(--ba-btn-bg)',
  color: 'var(--ba-btn-text)',
  borderColor: 'var(--ba-btn-border)',
  borderRadius: 'var(--ba-radius)',
};

interface LeadFormTerminalCardProps {
  readonly icon: string;
  readonly title: string;
  readonly body: string;
  readonly slug: string;
  readonly retryLabel?: string;
  readonly onRetry?: () => void;
}

// Shared shape for the rate-limited (01e) and generic-submission-error (01i) prototype screens —
// both fully replace the form with a centered card, unlike validation-error/captcha-error, which
// keep the filled form visible beneath a banner (see LeadFormWidget.tsx's phase routing).
export function LeadFormTerminalCard({
  icon,
  title,
  body,
  slug,
  retryLabel,
  onRetry,
}: LeadFormTerminalCardProps): React.JSX.Element {
  const t = useTranslations('hotsite');
  return (
    <div className="mx-auto max-w-2xl px-6 py-12" style={{ color: 'var(--ba-text)' }}>
      <div
        className="p-10 text-center"
        style={{ backgroundColor: 'var(--ba-secondary)', borderRadius: 'var(--ba-radius)' }}
        data-testid="lead-form-terminal-card"
      >
        <div
          className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100 text-2xl text-red-600"
          aria-hidden="true"
        >
          {icon}
        </div>
        <h1 className="mb-2 text-xl font-bold">{title}</h1>
        <p className="mx-auto mb-6 max-w-md leading-relaxed opacity-65">{body}</p>
        <div className="flex flex-wrap justify-center gap-3">
          {onRetry && retryLabel && (
            <button
              type="button"
              onClick={onRetry}
              style={btnStyle}
              data-testid="lead-form-retry"
              className="border-2 px-6 py-3 font-semibold"
            >
              {retryLabel}
            </button>
          )}
          <a
            href={`/${slug}`}
            className="border px-6 py-3"
            style={{ borderRadius: 'var(--ba-radius)', borderColor: 'var(--ba-secondary)' }}
          >
            {t('leadForm.backToSiteButton')}
          </a>
        </div>
      </div>
    </div>
  );
}
