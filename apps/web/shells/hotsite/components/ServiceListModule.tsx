import { useTranslations } from 'next-intl';
import type React from 'react';
import type { HotsiteServiceResponse, ServiceListModuleData } from '@ikaro/types';
import {
  LEGACY_SECTION_PADDING,
  legacySectionBackground,
  sectionCardBackground,
  sectionHeadingStyle,
  sectionTextColor,
} from '@/features/platform/hotsite/module-styles';
import { HotsiteSectionShell, type SectionPresentationProps } from './HotsiteSectionShell';
import { SectionEyebrow } from './SectionEyebrow';
import { ServiceItems } from './ServiceListCards';

interface ServiceListModuleProps extends SectionPresentationProps {
  readonly data: ServiceListModuleData;
  readonly slug: string;
  readonly services: readonly HotsiteServiceResponse[];
  readonly bgVariant?: 'default' | 'alt';
}

const headingStyle = sectionHeadingStyle;

export function ServiceListModule({
  data,
  services,
  slug,
  bgVariant,
  presentation,
  sectionTokens,
}: ServiceListModuleProps): React.JSX.Element {
  const t = useTranslations('hotsite');
  const title = data.title ?? t('services.defaultTitle');
  // Cards must contrast with the section bg — use the opposite surface color.
  const cardBg = sectionCardBackground(bgVariant);
  const showPrices = data.showPrices;
  const showPoints = data.showPoints;
  // Only 'booking' is a card action here. 'details' links to a service page that does not exist
  // yet (a service has no public slug until the service-profile story), and an omitted value is
  // 'none', today's behaviour.
  const action =
    data.itemAction === 'booking'
      ? { slug, label: data.itemCtaLabel || t('services.bookCta') }
      : undefined;

  return (
    <HotsiteSectionShell
      id="service-list"
      flow
      legacyBackground={legacySectionBackground(bgVariant)}
      legacyColor={sectionTextColor}
      legacyPadding={LEGACY_SECTION_PADDING}
      presentation={presentation}
      sectionTokens={sectionTokens}
    >
      {data.eyebrow && (
        <div className="text-center">
          <SectionEyebrow text={data.eyebrow} />
        </div>
      )}
      <h2 className="mb-10 text-center text-3xl font-bold" style={headingStyle}>
        {title}
      </h2>
      {services.length === 0 ? (
        <p className="text-center opacity-75">{t('services.empty')}</p>
      ) : (
        <ServiceItems
          layout={data.layout}
          services={services}
          showPrices={showPrices}
          showPoints={showPoints}
          cardBg={cardBg}
          action={action}
        />
      )}
    </HotsiteSectionShell>
  );
}
