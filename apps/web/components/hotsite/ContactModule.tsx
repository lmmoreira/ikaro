import type React from 'react';
import type { ContactModuleData, HotsiteBusinessInfoResponse } from '@ikaro/types';
import { sectionHeadingFont } from '@/lib/hotsite/module-styles';
import { SectionEyebrow } from './SectionEyebrow';

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

const linkStyle: React.CSSProperties = {
  color: 'var(--ba-primary)',
};

function formatAddress(address: NonNullable<HotsiteBusinessInfoResponse['address']>): string {
  const complement = address.complement ? ` - ${address.complement}` : '';
  const neighborhood = address.neighborhood ? ` - ${address.neighborhood}` : '';
  return `${address.street}, ${address.number}${complement}${neighborhood}, ${address.city} - ${address.state}, ${address.zipCode}`;
}

function digitsOnly(value: string): string {
  return value.replace(/\D/g, '');
}

function sanitizeUrl(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  try {
    const { protocol } = new URL(url);
    return protocol === 'https:' || protocol === 'http:' ? url : undefined;
  } catch {
    return undefined;
  }
}

function makeIconBoxStyle(cardBg: string): React.CSSProperties {
  return {
    width: 40,
    height: 40,
    backgroundColor: cardBg,
    border: '1px solid rgba(128,128,128,0.25)',
    borderRadius: 'var(--ba-radius)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    fontSize: 18,
  };
}

interface IconRowProps {
  readonly icon: string;
  readonly label: string;
  readonly children: React.ReactNode;
  readonly cardBg: string;
}

function IconRow({ icon, label, children, cardBg }: IconRowProps) {
  return (
    <div className="flex items-start gap-3">
      <div style={makeIconBoxStyle(cardBg)} aria-hidden="true">
        {icon}
      </div>
      <div>
        <div className="mb-0.5 text-xs uppercase tracking-wide opacity-60">{label}</div>
        <div className="text-sm font-semibold">{children}</div>
      </div>
    </div>
  );
}

function ListLayout({
  data,
  business,
  showAddress,
  showPhone,
  showEmail,
  showInstagram,
  showFacebook,
}: {
  readonly data: ContactModuleData;
  readonly business: HotsiteBusinessInfoResponse;
  readonly showAddress: boolean;
  readonly showPhone: boolean;
  readonly showEmail: boolean;
  readonly showInstagram: boolean;
  readonly showFacebook: boolean;
}) {
  const whatsapp = business.socialLinks?.whatsapp;
  const instagram = business.socialLinks?.instagram;
  const facebook = business.socialLinks?.facebook;
  const address = business.address;
  const waLabel = data.whatsappCtaLabel ?? 'WhatsApp';

  return (
    <div className="flex flex-col gap-3 text-sm">
      {showAddress && address && <p>{formatAddress(address)}</p>}
      {showPhone && <p>{business.phone}</p>}
      {showEmail && <p>{business.email}</p>}
      {data.showWhatsapp && whatsapp && (
        <a
          href={`https://wa.me/${digitsOnly(whatsapp)}`}
          target="_blank"
          rel="noopener noreferrer"
          style={linkStyle}
          className="font-semibold underline"
        >
          {waLabel}
        </a>
      )}
      {showInstagram && sanitizeUrl(instagram) && (
        <a
          href={sanitizeUrl(instagram)}
          target="_blank"
          rel="noopener noreferrer"
          style={linkStyle}
          className="underline"
        >
          Instagram
        </a>
      )}
      {showFacebook && sanitizeUrl(facebook) && (
        <a
          href={sanitizeUrl(facebook)}
          target="_blank"
          rel="noopener noreferrer"
          style={linkStyle}
          className="underline"
        >
          Facebook
        </a>
      )}
    </div>
  );
}

function IconCardsLayout({
  data,
  business,
  showAddress,
  showPhone,
  showEmail,
  showInstagram,
  showFacebook,
  cardBg,
}: {
  readonly data: ContactModuleData;
  readonly business: HotsiteBusinessInfoResponse;
  readonly showAddress: boolean;
  readonly showPhone: boolean;
  readonly showEmail: boolean;
  readonly showInstagram: boolean;
  readonly showFacebook: boolean;
  readonly cardBg: string;
}) {
  const whatsapp = business.socialLinks?.whatsapp;
  const instagram = business.socialLinks?.instagram;
  const facebook = business.socialLinks?.facebook;
  const address = business.address;
  const waLabel = data.whatsappCtaLabel ?? 'Chamar no WhatsApp';

  return (
    <div className="flex flex-col gap-5">
      {showAddress && address && (
        <IconRow icon="📍" label="Endereço" cardBg={cardBg}>
          {formatAddress(address)}
        </IconRow>
      )}
      {showPhone && business.phone && (
        <IconRow icon="📱" label="Telefone" cardBg={cardBg}>
          {business.phone}
        </IconRow>
      )}
      {showEmail && business.email && (
        <IconRow icon="✉️" label="E-mail" cardBg={cardBg}>
          {business.email}
        </IconRow>
      )}
      {data.showWhatsapp && whatsapp && (
        <IconRow icon="💬" label="WhatsApp" cardBg={cardBg}>
          <a
            href={`https://wa.me/${digitsOnly(whatsapp)}`}
            target="_blank"
            rel="noopener noreferrer"
            style={linkStyle}
            className="font-semibold underline"
          >
            {waLabel}
          </a>
        </IconRow>
      )}
      {showInstagram && sanitizeUrl(instagram) && (
        <IconRow icon="📸" label="Instagram" cardBg={cardBg}>
          <a
            href={sanitizeUrl(instagram)}
            target="_blank"
            rel="noopener noreferrer"
            style={linkStyle}
            className="underline"
          >
            Instagram
          </a>
        </IconRow>
      )}
      {showFacebook && sanitizeUrl(facebook) && (
        <IconRow icon="👥" label="Facebook" cardBg={cardBg}>
          <a
            href={sanitizeUrl(facebook)}
            target="_blank"
            rel="noopener noreferrer"
            style={linkStyle}
            className="underline"
          >
            Facebook
          </a>
        </IconRow>
      )}
    </div>
  );
}

export function ContactModule({ data, business, slug: _, bgVariant }: ContactModuleProps) {
  const title = data.title ?? 'Fale conosco';
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
              title="Mapa de localização"
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
