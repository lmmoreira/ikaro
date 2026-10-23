import { useTranslations } from 'next-intl';
import Link from 'next/link';
import type { HotsiteServiceResponse } from '@ikaro/types';
import { sectionHeadingStyle } from '@/features/platform/hotsite/module-styles';
import { useServiceDurationAndPrice } from './use-service-duration-and-price';

interface FeatureServiceCardProps {
  readonly service: HotsiteServiceResponse;
  readonly showPrices: boolean;
  readonly showPoints: boolean;
  readonly cardBg: string;
  readonly action?: { readonly slug: string; readonly label: string };
  readonly index?: number;
  readonly tone?: 'plain' | 'tinted';
}

export function FeatureServiceCard({
  service,
  showPrices,
  showPoints,
  cardBg,
  action,
  index = 0,
  tone = 'plain',
}: FeatureServiceCardProps): React.JSX.Element {
  const t = useTranslations('hotsite');
  const { duration, price } = useServiceDurationAndPrice(service);
  return (
    <li
      className="flex flex-col gap-3 border-t-4 p-8"
      style={{
        backgroundColor:
          tone === 'tinted'
            ? `color-mix(in srgb, ${index % 3 === 0 ? 'var(--ba-primary)' : index % 3 === 1 ? 'var(--ba-secondary)' : 'var(--ba-text)'} 18%, var(--ba-section-bg, var(--ba-background)))`
            : cardBg,
        borderColor: 'var(--ba-primary)',
        borderRadius: 'var(--ba-radius)',
        boxShadow: 'var(--ba-shadow)',
      }}
      data-testid="feature-service-card"
    >
      <h3 className="text-2xl font-bold" style={sectionHeadingStyle}>
        {service.name}
      </h3>
      {service.description && (
        <p className="text-sm leading-relaxed opacity-80">{service.description}</p>
      )}
      <div className="mt-auto flex flex-wrap items-end justify-between gap-2 pt-4">
        {showPrices && (
          <span
            className="text-2xl font-bold"
            style={{ color: 'var(--ba-primary)' }}
            data-testid="price-badge"
          >
            {price}
          </span>
        )}
        <span className="text-xs opacity-75">
          {duration}
          {showPoints && (
            <span data-testid="loyalty-points-badge">
              {duration ? ' · ' : ''}
              {t('services.pointsSuffix', { count: service.loyaltyPointsValue })}
            </span>
          )}
        </span>
      </div>
      {action && (
        <Link
          href={`/${action.slug}/booking?serviceId=${service.id}`}
          data-testid="service-action"
          style={{
            backgroundColor: 'var(--ba-btn-bg)',
            color: 'var(--ba-btn-text)',
            borderColor: 'var(--ba-btn-border)',
            borderRadius: 'var(--ba-radius)',
          }}
          className="mt-3 inline-block self-start border-2 px-5 py-2 text-sm font-semibold transition-all hover:bg-[var(--ba-btn-hover-bg)] hover:opacity-90"
        >
          {action.label}
        </Link>
      )}
    </li>
  );
}
