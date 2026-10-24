import { useTranslations } from 'next-intl';
import type { HotsiteServiceResponse } from '@ikaro/types';
import { sectionHeadingStyle } from '@/features/platform/hotsite/module-styles';
import { useServiceDurationAndPrice } from './use-service-duration-and-price';
import type { SectionTint } from '@/features/platform/hotsite/section-tints';
import { ServiceActionLink, type ServiceCardAction } from './ServiceActionLink';

interface FeatureServiceCardProps {
  readonly service: HotsiteServiceResponse;
  readonly showPrices: boolean;
  readonly showPoints: boolean;
  readonly cardBg: string;
  readonly action?: ServiceCardAction;
  readonly tone?: 'plain' | 'tinted';
  readonly tint?: SectionTint;
}

export function FeatureServiceCard({
  service,
  showPrices,
  showPoints,
  cardBg,
  action,
  tone = 'plain',
  tint,
}: FeatureServiceCardProps): React.JSX.Element {
  const t = useTranslations('hotsite');
  const { duration, price } = useServiceDurationAndPrice(service);
  return (
    <li
      className="flex flex-col gap-3 border-t-4 p-8"
      style={{
        backgroundColor: tone === 'tinted' && tint ? tint.background : cardBg,
        ...(tone === 'tinted' && tint ? { color: tint.text } : {}),
        borderColor: 'var(--ba-primary)',
        borderRadius: 'var(--ba-radius)',
        boxShadow: 'var(--ba-shadow)',
      }}
      data-testid="feature-service-card"
    >
      <h3
        className="text-2xl font-bold"
        style={{ ...sectionHeadingStyle, ...(tint ? { color: 'inherit' } : {}) }}
      >
        {service.name}
      </h3>
      {service.description && (
        <p className="text-sm leading-relaxed opacity-80">{service.description}</p>
      )}
      <div className="mt-auto flex flex-wrap items-end justify-between gap-2 pt-4">
        {showPrices && (
          <span
            className="text-2xl font-bold"
            style={{ color: tint ? 'inherit' : 'var(--ba-primary)' }}
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
      {action && <ServiceActionLink service={service} action={action} />}
    </li>
  );
}
