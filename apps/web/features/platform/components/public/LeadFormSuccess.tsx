import { useTranslations } from 'next-intl';

export function LeadFormSuccess({ slug }: { readonly slug: string }): React.JSX.Element {
  const t = useTranslations('hotsite');
  return (
    <main
      className="min-h-screen"
      style={{ backgroundColor: 'var(--ba-background)', color: 'var(--ba-text)' }}
    >
      <div className="mx-auto max-w-2xl px-6 py-12" data-testid="lead-form-success">
        <div
          className="flex items-start gap-3.5 border border-green-300 bg-green-50 p-4.5"
          style={{ borderRadius: 'var(--ba-radius)' }}
        >
          <span
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-green-600 text-white"
            aria-hidden="true"
          >
            ✓
          </span>
          <div>
            <p className="font-bold text-green-800">{t('leadForm.successTitle')}</p>
            <p className="mt-0.5 text-sm text-green-700 opacity-85">{t('leadForm.successBody')}</p>
          </div>
        </div>
        <a
          href={`/${slug}`}
          className="mt-4 inline-block border px-6 py-3"
          style={{ borderRadius: 'var(--ba-radius)', borderColor: 'var(--ba-secondary)' }}
        >
          {t('leadForm.backToSiteButton')}
        </a>
      </div>
    </main>
  );
}
