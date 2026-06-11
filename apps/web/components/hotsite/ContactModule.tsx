import type React from 'react';
import type { ContactModuleData, HotsiteBusinessInfoResponse } from '@beloauto/types';
import { sectionHeadingFont } from '@/lib/hotsite/module-styles';

interface ContactModuleProps {
  readonly data: ContactModuleData;
  readonly business: HotsiteBusinessInfoResponse;
  readonly slug: string;
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
  return `${address.street}, ${address.number}${complement} - ${address.neighborhood}, ${address.city} - ${address.state}, ${address.zipCode}`;
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

export function ContactModule({ data, business, slug: _ }: ContactModuleProps) {
  const title = data.title ?? 'Fale conosco';
  const address = business.address;
  const showAddress = data.showAddress && address !== null;
  const showPhone = data.showPhone && business.phone !== null;
  const showEmail = data.showEmail && business.email !== null;
  const showMap = data.showMap && address !== null;
  const whatsapp = business.socialLinks?.whatsapp;
  const instagram = business.socialLinks?.instagram;
  const facebook = business.socialLinks?.facebook;

  return (
    <section
      style={{
        backgroundColor: 'var(--ba-background)',
        color: 'var(--ba-text)',
        padding: 'var(--ba-section-py) 1.5rem',
      }}
    >
      <div className="mx-auto max-w-7xl">
        <h2 className="mb-10 text-center text-3xl font-bold" style={headingStyle}>
          {title}
        </h2>
        <div className="grid gap-10 md:grid-cols-2">
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
                WhatsApp
              </a>
            )}
            {sanitizeUrl(instagram) && (
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
            {sanitizeUrl(facebook) && (
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
