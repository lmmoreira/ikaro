import { useTranslations } from 'next-intl';
import type React from 'react';
import type { HotsiteServiceResponse, ServiceListModuleData } from '@ikaro/types';
import { sectionHeadingStyle600 } from '@/features/platform/hotsite/module-styles';
import { useServiceDurationAndPrice as useDurationAndPrice } from './use-service-duration-and-price';
import { FeatureServiceCard } from './FeatureServiceCard';
import { ServiceActionLink, type ServiceCardAction } from './ServiceActionLink';
export type { ServiceCardAction } from './ServiceActionLink';
import type { SectionTint } from '@/features/platform/hotsite/section-tints';

const headingStyle600 = sectionHeadingStyle600;

// What a service card does. 'booking' (the default): a link into the service-first booking flow with
// that service preselected (no date), labelled `label`. 'details': a link to the service's own page,
// labelled `label` — but only for a service whose page is published (the public list gives it a
// `publicSlug` then, and null otherwise); any other service falls back to the booking link under
// `fallbackLabel`, so a card never links to a page that does not exist. Absent means the card has no
// action, which is today's behaviour.
interface ServiceCardProps {
  readonly service: HotsiteServiceResponse;
  readonly showPrices: boolean;
  readonly showPoints: boolean;
  readonly cardBg: string;
  readonly action?: ServiceCardAction;
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
      <h3 className="text-xl font-semibold" style={headingStyle600}>
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

function RuledServiceCard({
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
      className={`flex flex-col gap-3 p-7 ${index ? 'md:border-l' : ''}`}
      style={{ borderColor: 'var(--ba-section-divider, var(--ba-divider, rgba(0,0,0,0.15)))' }}
    >
      <span className="text-sm font-semibold tabular-nums" style={{ color: 'var(--ba-primary)' }}>
        {String(index + 1).padStart(2, '0')}
      </span>
      <h3 className="text-xl font-semibold" style={headingStyle600}>
        {service.name}
      </h3>
      {service.description && <p className="text-sm opacity-80">{service.description}</p>}
      <p className="text-sm opacity-75">{duration}</p>
      {showPrices && (
        <p className="font-bold" data-testid="price-badge">
          {price}
        </p>
      )}
      {showPoints && (
        <p className="text-xs opacity-75" data-testid="loyalty-points-badge">
          {t('services.pointsSuffix', { count: service.loyaltyPointsValue })}
        </p>
      )}
      {action && <ServiceActionLink service={service} action={{ ...action, appearance: 'link' }} />}
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
        <h3 className="text-xl font-semibold" style={headingStyle600}>
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
  tints,
}: {
  readonly layout: ServiceListModuleData['layout'];
  readonly services: readonly HotsiteServiceResponse[];
  readonly showPrices: boolean;
  readonly showPoints: boolean;
  readonly cardBg: string;
  readonly action?: ServiceCardAction;
  readonly cardColumns?: 2 | 3;
  readonly cardTone?: 'plain' | 'tinted' | 'ruled';
  readonly tints?: readonly [SectionTint, SectionTint, SectionTint];
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
            tone={cardTone === 'tinted' ? 'tinted' : 'plain'}
            tint={tints?.[index % 3]}
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
          <RuledServiceCard key={service.id} service={service} index={index} {...shared} />
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
