import { useTranslations } from 'next-intl';
import type React from 'react';
import type { ContactModuleData, HotsiteBusinessInfoResponse } from '@ikaro/types';
import { digitsOnly } from '@/shared/utils/digits-only';

// Split out of ContactModule.tsx (TD37-S05, file-length) — the two display-style layouts
// (list vs. icon-cards), their shared IconRow presentational piece, and the address-formatting
// helper both this file and ContactModule.tsx need. Pure presentational split — no new logic —
// so it shares ContactModule.spec.tsx's existing coverage rather than needing its own spec.

const linkStyle: React.CSSProperties = {
  color: 'var(--ba-primary)',
};

export function formatAddress(
  address: NonNullable<HotsiteBusinessInfoResponse['address']>,
): string {
  const complement = address.complement ? ` - ${address.complement}` : '';
  const neighborhood = address.neighborhood ? ` - ${address.neighborhood}` : '';
  return `${address.street}, ${address.number}${complement}${neighborhood}, ${address.city} - ${address.state}, ${address.zipCode}`;
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

function IconRow({ icon, label, children, cardBg }: IconRowProps): React.JSX.Element {
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

interface ContactLayoutProps {
  readonly data: ContactModuleData;
  readonly business: HotsiteBusinessInfoResponse;
  readonly showAddress: boolean;
  readonly showPhone: boolean;
  readonly showEmail: boolean;
  readonly showInstagram: boolean;
  readonly showFacebook: boolean;
}

export function ListLayout({
  data,
  business,
  showAddress,
  showPhone,
  showEmail,
  showInstagram,
  showFacebook,
}: ContactLayoutProps): React.JSX.Element {
  const t = useTranslations('hotsite');
  const whatsapp = business.socialLinks?.whatsapp;
  const instagram = business.socialLinks?.instagram;
  const facebook = business.socialLinks?.facebook;
  const address = business.address;
  const waLabel = data.whatsappCtaLabel ?? t('contact.whatsappLabel');

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

export function IconCardsLayout({
  data,
  business,
  showAddress,
  showPhone,
  showEmail,
  showInstagram,
  showFacebook,
  cardBg,
}: ContactLayoutProps & { readonly cardBg: string }): React.JSX.Element {
  const t = useTranslations('hotsite');
  const whatsapp = business.socialLinks?.whatsapp;
  const instagram = business.socialLinks?.instagram;
  const facebook = business.socialLinks?.facebook;
  const address = business.address;
  const waLabel = data.whatsappCtaLabel ?? t('contact.whatsappDefaultCta');

  return (
    <div className="flex flex-col gap-5">
      {showAddress && address && (
        <IconRow icon="📍" label={t('contact.addressLabel')} cardBg={cardBg}>
          {formatAddress(address)}
        </IconRow>
      )}
      {showPhone && business.phone && (
        <IconRow icon="📱" label={t('contact.phoneLabel')} cardBg={cardBg}>
          {business.phone}
        </IconRow>
      )}
      {showEmail && business.email && (
        <IconRow icon="✉️" label={t('contact.emailLabel')} cardBg={cardBg}>
          {business.email}
        </IconRow>
      )}
      {data.showWhatsapp && whatsapp && (
        <IconRow icon="💬" label={t('contact.whatsappLabel')} cardBg={cardBg}>
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
