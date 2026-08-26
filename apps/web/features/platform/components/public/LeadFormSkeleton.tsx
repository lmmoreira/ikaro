import { useTranslations } from 'next-intl';

const skeletonStyle: React.CSSProperties = { backgroundColor: 'var(--ba-secondary)' };

export function LeadFormSkeleton({ title }: { readonly title: string }): React.JSX.Element {
  const t = useTranslations('hotsite');
  return (
    <div
      className="mx-auto max-w-2xl px-6 py-12"
      style={{ color: 'var(--ba-text)' }}
      aria-busy="true"
      aria-label={t('leadForm.loadingLabel')}
      data-testid="lead-form-loading"
    >
      <h1 className="sr-only">{title}</h1>
      <div className="space-y-3">
        <div className="h-6 w-2/3 animate-pulse rounded" style={skeletonStyle} />
        <div className="h-10 w-full animate-pulse rounded" style={skeletonStyle} />
        <div className="h-10 w-full animate-pulse rounded" style={skeletonStyle} />
      </div>
    </div>
  );
}
