import Link from 'next/link';
import { buildBookingDeepLinkUrl, type HotsiteServiceResponse } from '@ikaro/types';

export interface ServiceCardAction {
  readonly slug: string;
  readonly label: string;
  readonly kind?: 'booking' | 'details';
  readonly fallbackLabel?: string;
}

export function ServiceActionLink({
  service,
  action,
}: {
  readonly service: HotsiteServiceResponse;
  readonly action: ServiceCardAction;
}): React.JSX.Element {
  const detailsHref =
    action.kind === 'details' && service.publicSlug
      ? `/${action.slug}/servicos/${service.publicSlug}`
      : null;
  return (
    <Link
      href={detailsHref ?? buildBookingDeepLinkUrl(`/${action.slug}`, { serviceId: service.id })}
      data-testid="service-action"
      data-action={detailsHref ? 'details' : 'booking'}
      style={{
        backgroundColor: 'var(--ba-btn-bg)',
        color: 'var(--ba-btn-text)',
        borderColor: 'var(--ba-btn-border)',
        borderRadius: 'var(--ba-btn-radius, var(--ba-radius))',
      }}
      className="mt-3 inline-block self-start border-2 px-5 py-2 text-sm font-semibold transition-all hover:bg-[var(--ba-btn-hover-bg)] hover:opacity-90"
    >
      {detailsHref || action.kind !== 'details'
        ? action.label
        : (action.fallbackLabel ?? action.label)}
    </Link>
  );
}
