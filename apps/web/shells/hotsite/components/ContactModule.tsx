import { useTranslations } from 'next-intl';
import type React from 'react';
import type { ContactModuleData, HotsiteBusinessInfoResponse } from '@ikaro/types';
import { sectionHeadingFont } from '@/features/platform/hotsite/module-styles';
import { SectionEyebrow } from './SectionEyebrow';
import { IconCardsLayout, ListLayout, formatAddress } from './ContactModuleLayouts';

interface ContactModuleProps {
  readonly data: ContactModuleData;
  readonly business: HotsiteBusinessInfoResponse;
  readonly slug: string;
  readonly bgVariant?: 'default' | 'alt';
}

const headingStyle: React.CSSProperties = {
  ...sectionHeadingFont,
  color: 'var(--ba-text)',
};

export function ContactModule({
  data,
  business,
  slug: _,
  bgVariant,
}: ContactModuleProps): React.JSX.Element {
  const t = useTranslations('hotsite');
  const title = data.title ?? t('contact.defaultTitle');
  const address = business.address;
  const bg = bgVariant === 'alt' ? 'var(--ba-secondary)' : 'var(--ba-background)';

  const showAddress = data.showAddress && address !== null;
  const showPhone = data.showPhone && business.phone !== null;
  const showEmail = data.showEmail && business.email !== null;
  const showMap = data.showMap && address !== null;
  // Instagram and Facebook: shown by default (backward compat) unless explicitly set to false
  const showInstagram = data.showInstagram !== false;
  const showFacebook = data.showFacebook !== false;

  const isIconCards = data.displayStyle === 'icon-cards';
  const cardBg = bgVariant === 'alt' ? 'var(--ba-background)' : 'var(--ba-secondary)';

  return (
    <section
      id="contact"
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
      </div>
    </section>
  );
}
