import type React from 'react';
import type { HotsiteServiceResponse, ServiceListModuleData } from '@ikaro/types';
import { formatDuration } from '@/lib/formatting/format-duration';
import { sectionHeadingFont } from '@/lib/hotsite/module-styles';
import { SectionEyebrow } from './SectionEyebrow';

interface ServiceListModuleProps {
  readonly data: ServiceListModuleData;
  readonly slug: string;
  readonly services: readonly HotsiteServiceResponse[];
  readonly bgVariant?: 'default' | 'alt';
}

const headingStyle: React.CSSProperties = {
  ...sectionHeadingFont,
  color: 'var(--ba-text)',
};

interface ServiceCardProps {
  readonly service: HotsiteServiceResponse;
  readonly showPrices: boolean;
  readonly showPoints: boolean;
  readonly cardBg: string;
}

function ServiceCard({ service, showPrices, showPoints, cardBg }: ServiceCardProps) {
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
        <span className="opacity-75">{formatDuration(service.durationMinutes)}</span>
        {showPrices && (
          <span
            className="font-bold"
            style={{ color: 'var(--ba-primary)' }}
            data-testid="price-badge"
          >
            {service.price.formatted}
          </span>
        )}
      </div>
      {showPoints && (
        <span className="text-xs opacity-75" data-testid="loyalty-points-badge">
          +{service.loyaltyPointsValue} pontos
        </span>
      )}
    </li>
  );
}

export function ServiceListModule({ data, services, slug: _, bgVariant }: ServiceListModuleProps) {
  const title = data.title ?? 'Nossos Serviços';
  const bg = bgVariant === 'alt' ? 'var(--ba-secondary)' : 'var(--ba-background)';
  // Cards must contrast with the section bg — use the opposite surface color.
  const cardBg = bgVariant === 'alt' ? 'var(--ba-background)' : 'var(--ba-secondary)';
  const listClassName =
    data.layout === 'list'
      ? 'list-none flex flex-col gap-4 max-w-2xl mx-auto'
      : 'list-none grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6';

  return (
    <section
      id="service-list"
      style={{
        backgroundColor: bg,
        color: 'var(--ba-text)',
        padding: 'var(--ba-section-py) 1.5rem',
      }}
    >
      <div className="mx-auto max-w-7xl">
        {data.eyebrow && (
          <div className="text-center">
            <SectionEyebrow text={data.eyebrow} />
          </div>
        )}
        <h2 className="mb-10 text-center text-3xl font-bold" style={headingStyle}>
          {title}
        </h2>
        {services.length === 0 ? (
          <p className="text-center opacity-75">Nenhum serviço disponível no momento</p>
        ) : (
          <ul className={listClassName}>
            {services.map((service) => (
              <ServiceCard
                key={service.id}
                service={service}
                showPrices={data.showPrices}
                showPoints={data.showPoints}
                cardBg={cardBg}
              />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
