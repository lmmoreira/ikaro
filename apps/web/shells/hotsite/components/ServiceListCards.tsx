import { useLocale, useTranslations } from 'next-intl';
import type React from 'react';
import type { HotsiteServiceResponse, ServiceListModuleData } from '@ikaro/types';
import { formatDuration } from '@/shared/lib/formatting/format-duration';
import { formatMoney } from '@/shared/lib/formatting/format-money';
import { isPerTimeService } from '@/features/booking/model/selection-totals';
import { sectionHeadingStyle } from '@/features/platform/hotsite/module-styles';

const headingStyle = sectionHeadingStyle;

interface ServiceCardProps {
  readonly service: HotsiteServiceResponse;
  readonly showPrices: boolean;
  readonly showPoints: boolean;
  readonly cardBg: string;
}

// A per-time service has no fixed price or duration: show its rate and duration range instead.
function useDurationAndPrice(service: HotsiteServiceResponse): { duration: string; price: string } {
  const t = useTranslations('booking');
  const locale = useLocale();
  const { bookingPolicy: policy } = service;
  if (!isPerTimeService(service) || policy.pricePerIncrementAmount === null) {
    return { duration: formatDuration(service.durationMinutes), price: service.price.formatted };
  }
  const rate = formatMoney(policy.pricePerIncrementAmount, locale, service.price.currency);
  const minutes = policy.pricingIncrementMinutes ?? 60;
  const hasRange = policy.durationMinMinutes !== null && policy.durationMaxMinutes !== null;
  return {
    duration: hasRange
      ? t('serviceSelection.durationRange', {
          min: formatDuration(policy.durationMinMinutes ?? 0),
          max: formatDuration(policy.durationMaxMinutes ?? 0),
        })
      : '',
    price:
      minutes === 60
        ? t('serviceSelection.ratePerHour', { rate })
        : t('serviceSelection.ratePerIncrement', { rate, minutes }),
  };
}

function ServiceCard({
  service,
  showPrices,
  showPoints,
  cardBg,
}: ServiceCardProps): React.JSX.Element {
  const t = useTranslations('hotsite');
  const { duration, price } = useDurationAndPrice(service);
  const cardStyle: React.CSSProperties = {
    backgroundColor: cardBg,
    borderRadius: 'var(--ba-radius)',
    boxShadow: 'var(--ba-shadow)',
  };
  return (
    <li className="flex flex-col gap-2 p-6" style={cardStyle}>
      <h3 className="text-xl font-semibold" style={headingStyle}>
        {service.name}
      </h3>
      {service.description && <p className="text-sm opacity-80">{service.description}</p>}
      <div className="mt-2 flex items-center justify-between text-sm">
        <span className="opacity-75">{duration}</span>
        {showPrices && (
          <span
            className="font-bold"
            style={{ color: 'var(--ba-primary)' }}
            data-testid="price-badge"
          >
            {price}
          </span>
        )}
      </div>
      {showPoints && (
        <span className="text-xs opacity-75" data-testid="loyalty-points-badge">
          {t('services.pointsSuffix', { count: service.loyaltyPointsValue })}
        </span>
      )}
    </li>
  );
}

function NumberedServiceRow({
  service,
  index,
  showPrices,
  showPoints,
}: Omit<ServiceCardProps, 'cardBg'> & { readonly index: number }): React.JSX.Element {
  const t = useTranslations('hotsite');
  const { duration, price } = useDurationAndPrice(service);
  return (
    <li
      className="grid grid-cols-[auto_1fr] items-baseline gap-x-5 gap-y-1 border-b py-6 sm:grid-cols-[auto_1fr_auto]"
      style={{ borderColor: 'var(--ba-section-divider, var(--ba-divider, rgba(0,0,0,0.15)))' }}
      data-testid="numbered-service"
    >
      <span
        aria-hidden="true"
        className="text-3xl font-light tabular-nums opacity-60"
        style={{ fontFamily: 'var(--ba-heading-font)' }}
      >
        {String(index + 1).padStart(2, '0')}
      </span>
      <div>
        <h3 className="text-xl font-semibold" style={headingStyle}>
          {service.name}
        </h3>
        {service.description && <p className="mt-1 text-sm opacity-80">{service.description}</p>}
        <p className="mt-1 text-xs opacity-70">
          {duration}
          {showPoints && (
            <span data-testid="loyalty-points-badge">
              {duration ? ' · ' : ''}
              {t('services.pointsSuffix', { count: service.loyaltyPointsValue })}
            </span>
          )}
        </p>
      </div>
      {showPrices && (
        <span
          className="col-start-2 text-lg font-bold sm:col-start-3"
          style={{ color: 'var(--ba-primary)' }}
          data-testid="price-badge"
        >
          {price}
        </span>
      )}
    </li>
  );
}

function FeatureServiceCard({
  service,
  showPrices,
  showPoints,
  cardBg,
}: ServiceCardProps): React.JSX.Element {
  const t = useTranslations('hotsite');
  const { duration, price } = useDurationAndPrice(service);
  return (
    <li
      className="flex flex-col gap-3 border-t-4 p-8"
      style={{
        backgroundColor: cardBg,
        borderColor: 'var(--ba-primary)',
        borderRadius: 'var(--ba-radius)',
        boxShadow: 'var(--ba-shadow)',
      }}
      data-testid="feature-service-card"
    >
      <h3 className="text-2xl font-bold" style={headingStyle}>
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
    </li>
  );
}

// The services of a Service List in one of its four layouts: grid and list (cards), numbered (a
// price menu) or feature-cards (large cards).
export function ServiceItems({
  layout,
  services,
  showPrices,
  showPoints,
  cardBg,
}: {
  readonly layout: ServiceListModuleData['layout'];
  readonly services: readonly HotsiteServiceResponse[];
  readonly showPrices: boolean;
  readonly showPoints: boolean;
  readonly cardBg: string;
}): React.JSX.Element {
  const shared = { showPrices, showPoints };
  if (layout === 'numbered') {
    return (
      <ol
        className="mx-auto max-w-3xl list-none border-t"
        style={{ borderColor: 'var(--ba-section-divider, var(--ba-divider, rgba(0,0,0,0.15)))' }}
      >
        {services.map((service, index) => (
          <NumberedServiceRow key={service.id} service={service} index={index} {...shared} />
        ))}
      </ol>
    );
  }
  if (layout === 'feature-cards') {
    return (
      <ul className="grid list-none grid-cols-1 gap-8 md:grid-cols-2">
        {services.map((service) => (
          <FeatureServiceCard key={service.id} service={service} cardBg={cardBg} {...shared} />
        ))}
      </ul>
    );
  }
  const listClassName =
    layout === 'list'
      ? 'list-none flex flex-col gap-4 max-w-2xl mx-auto'
      : 'list-none grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6';
  return (
    <ul className={listClassName}>
      {services.map((service) => (
        <ServiceCard key={service.id} service={service} cardBg={cardBg} {...shared} />
      ))}
    </ul>
  );
}
