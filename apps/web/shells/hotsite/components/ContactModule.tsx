import { useTranslations } from 'next-intl';
import type React from 'react';
import type { ContactModuleData, HotsiteBusinessInfoResponse } from '@ikaro/types';
import {
  LEGACY_SECTION_PADDING,
  legacySectionBackground,
  sectionCardBackground,
  sectionHeadingStyle,
  sectionTextColor,
} from '@/features/platform/hotsite/module-styles';
import { HotsiteSectionShell, type SectionPresentationProps } from './HotsiteSectionShell';
import { SectionEyebrow } from './SectionEyebrow';
import { IconCardsLayout, ListLayout, formatAddress } from './ContactModuleLayouts';

interface ContactModuleProps extends SectionPresentationProps {
  readonly data: ContactModuleData;
  readonly business: HotsiteBusinessInfoResponse;
  readonly slug: string;
  readonly bgVariant?: 'default' | 'alt';
}

const headingStyle = sectionHeadingStyle;

export function ContactModule({
  data,
  business,
  slug: _,
  bgVariant,
  presentation,
  sectionTokens,
}: ContactModuleProps): React.JSX.Element {
  const t = useTranslations('hotsite');
  const title = data.title ?? t('contact.defaultTitle');
  const address = business.address;

  const showAddress = data.showAddress && address !== null;
  const showPhone = data.showPhone && business.phone !== null;
  const showEmail = data.showEmail && business.email !== null;
  const showMap = data.showMap && address !== null;
  // Instagram and Facebook: shown by default (backward compat) unless explicitly set to false
  const showInstagram = data.showInstagram !== false;
  const showFacebook = data.showFacebook !== false;

  const isIconCards = data.displayStyle === 'icon-cards';
  const cardBg = sectionCardBackground(bgVariant);

  return (
    <HotsiteSectionShell
      id="contact"
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
      <div className="grid gap-10 md:grid-cols-2">
        {isIconCards ? (
          <IconCardsLayout
            data={data}
            business={business}
            showAddress={showAddress}
            showPhone={showPhone}
            showEmail={showEmail}
            showInstagram={showInstagram}
            showFacebook={showFacebook}
            cardBg={cardBg}
          />
        ) : (
          <ListLayout
            data={data}
            business={business}
            showAddress={showAddress}
            showPhone={showPhone}
            showEmail={showEmail}
            showInstagram={showInstagram}
            showFacebook={showFacebook}
          />
        )}
        {showMap && address && (
          <iframe
            title={t('contact.mapTitle')}
            src={`https://maps.google.com/maps?q=${encodeURIComponent(formatAddress(address))}&output=embed`}
            loading="lazy"
            className="h-64 w-full border-0"
            style={{ borderRadius: 'var(--ba-radius)' }}
          />
        )}
      </div>
    </HotsiteSectionShell>
  );
}
