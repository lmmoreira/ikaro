import { useTranslations } from 'next-intl';
import Link from 'next/link';
import type React from 'react';
import type { HotsiteServiceResponse, ServiceListModuleData } from '@ikaro/types';
import { sectionHeadingStyle } from '@/features/platform/hotsite/module-styles';
import { useServiceDurationAndPrice as useDurationAndPrice } from './use-service-duration-and-price';
import { FeatureServiceCard } from './FeatureServiceCard';

const headingStyle = sectionHeadingStyle;

// What a service card does when `itemAction` is 'booking': a link into the service-first booking
// flow with that service preselected (no date), labelled `label`. Absent means the card has no
// action, which is today's behaviour.
export interface ServiceCardAction {
  readonly slug: string;
  readonly label: string;
}

interface ServiceCardProps {
  readonly service: HotsiteServiceResponse;
  readonly showPrices: boolean;
  readonly showPoints: boolean;
  readonly cardBg: string;
  readonly action?: ServiceCardAction;
}

const actionStyle: React.CSSProperties = {
  backgroundColor: 'var(--ba-btn-bg)',
  color: 'var(--ba-btn-text)',
  borderColor: 'var(--ba-btn-border)',
  borderRadius: 'var(--ba-radius)',
};

function ServiceActionLink({
  service,
  action,
}: {
  readonly service: HotsiteServiceResponse;
  readonly action: ServiceCardAction;
}): React.JSX.Element {
  return (
    <Link
      href={`/${action.slug}/booking?serviceId=${service.id}`}
      data-testid="service-action"
      style={actionStyle}
      className="mt-3 inline-block self-start border-2 px-5 py-2 text-sm font-semibold transition-all hover:bg-[var(--ba-btn-hover-bg)] hover:opacity-90"
    >
      {action.label}
    </Link>
  );
}

function ServiceCard({
  service,
  showPrices,
  showPoints,
  cardBg,
  action,
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
      {action && <ServiceActionLink service={service} action={action} />}
    </li>
  );
}

function NumberedServiceRow({
  service,
  index,
  showPrices,
  showPoints,
  action,
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
        {action && <ServiceActionLink service={service} action={action} />}
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

// The services of a Service List in one of its four layouts: grid and list (cards), numbered (a
// price menu) or feature-cards (large cards).
export function ServiceItems({
  layout,
  services,
  showPrices,
  showPoints,
  cardBg,
  action,
  cardColumns,
  cardTone,
}: {
  readonly layout: ServiceListModuleData['layout'];
  readonly services: readonly HotsiteServiceResponse[];
  readonly showPrices: boolean;
  readonly showPoints: boolean;
  readonly cardBg: string;
  readonly action?: ServiceCardAction;
  readonly cardColumns?: 2 | 3;
  readonly cardTone?: 'plain' | 'tinted' | 'ruled';
}): React.JSX.Element {
  const shared = { showPrices, showPoints, action };
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
      <ul
        className={`grid list-none grid-cols-1 gap-8 ${cardColumns === 3 ? 'md:grid-cols-3' : 'md:grid-cols-2'}`}
      >
        {services.map((service, index) => (
          <FeatureServiceCard
            key={service.id}
            service={service}
            cardBg={cardBg}
            index={index}
            tone={cardTone === 'tinted' ? 'tinted' : 'plain'}
            {...shared}
          />
        ))}
      </ul>
    );
  }
  const listClassName =
    layout === 'list'
      ? 'list-none flex flex-col gap-4 max-w-2xl mx-auto'
      : 'list-none grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6';
  if (layout === 'grid' && cardTone === 'ruled') {
    return (
      <ul className="list-none grid grid-cols-1 md:grid-cols-3" data-testid="ruled-service-list">
        {services.map((service, index) => (
          <li
            key={service.id}
            className={`p-7 ${index ? 'border-l' : ''}`}
            style={{ borderColor: 'var(--ba-section-divider)' }}
          >
            <span className="text-sm font-semibold" style={{ color: 'var(--ba-primary)' }}>
              {String(index + 1).padStart(2, '0')}
            </span>
            <ServiceCard service={service} cardBg="transparent" {...shared} />
          </li>
        ))}
      </ul>
    );
  }
  return (
    <ul className={listClassName}>
      {services.map((service) => (
        <ServiceCard key={service.id} service={service} cardBg={cardBg} {...shared} />
      ))}
    </ul>
  );
}
