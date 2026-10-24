import Image from 'next/image';
import { useTranslations } from 'next-intl';
import type { FooterModuleData, HotsiteBusinessInfoResponse } from '@ikaro/types';
import { digitsOnly } from '@/shared/utils/digits-only';
import type { SectionPresentationProps } from './HotsiteSectionShell';

interface FooterProps extends SectionPresentationProps {
  readonly slug: string;
  readonly data: FooterModuleData;
  readonly tenantName: string;
  readonly business: HotsiteBusinessInfoResponse;
  readonly logoUrl: string;
}

// Same brand-mark treatment as HotsiteAuthBar's BrandMark, sized for the footer (see
// journeys/shared/hotsite.html's footer section) — falls back to an initial-letter badge.
function FooterBrandMark({
  logoUrl,
  tenantName,
}: {
  readonly logoUrl: string;
  readonly tenantName: string;
}): React.JSX.Element {
  return logoUrl ? (
    <Image
      src={logoUrl}
      alt={tenantName}
      width={20}
      height={20}
      className="h-5 w-5 rounded-full object-cover"
    />
  ) : (
    <div
      className="flex h-5 w-5 items-center justify-center rounded-full text-[0.625rem] font-bold"
      style={{ backgroundColor: 'var(--ba-primary)', color: 'var(--ba-btn-text)' }}
    >
      {tenantName.charAt(0).toUpperCase()}
    </div>
  );
}

export function Footer({
  slug: _,
  data,
  tenantName,
  business,
  logoUrl,
  presentation,
  sectionTokens,
}: FooterProps): React.JSX.Element {
  const t = useTranslations('hotsite');
  const whatsapp = business.socialLinks?.whatsapp;
  const showWhatsapp = data.showWhatsapp !== false;
  const year = new Date().getFullYear();
  const copyrightNote = data.copyrightNote ?? t('footer.copyrightDefault');

  return (
    <footer
      style={{
        ...(presentation?.surface && sectionTokens
          ? {
              ...sectionTokens,
              backgroundColor: 'var(--ba-section-bg)',
              color: 'var(--ba-section-text)',
            }
          : {
              backgroundColor: 'var(--ba-secondary)',
              color: 'var(--ba-secondary-text, var(--ba-text))',
            }),
        padding: '2.5rem 1.5rem',
        textAlign: 'center',
      }}
    >
      <div className="mb-2 flex items-center justify-center gap-2">
        <FooterBrandMark logoUrl={logoUrl} tenantName={tenantName} />
        <div
          className="text-lg font-black uppercase tracking-widest"
          style={{
            color: presentation?.surface
              ? 'var(--ba-section-text)'
              : 'var(--ba-secondary-accent, var(--ba-primary))',
          }}
          data-testid="footer-brand-name"
        >
          {tenantName}
        </div>
      </div>
      {data.tagline && (
        <p className="mt-1 text-xs opacity-60" data-testid="footer-tagline">
          {data.tagline}
        </p>
      )}
      {showWhatsapp && whatsapp && (
        <a
          href={`https://wa.me/${digitsOnly(whatsapp)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold transition-opacity hover:opacity-90"
          style={{
            backgroundColor: 'var(--ba-primary)',
            color: 'var(--ba-btn-text)',
            borderRadius: 'var(--ba-btn-radius, var(--ba-radius))',
            display: 'inline-flex',
            marginTop: '1rem',
          }}
          data-testid="footer-whatsapp"
        >
          💬 {whatsapp}
        </a>
      )}
      <p className="mt-4 text-xs opacity-40" data-testid="footer-copyright">
        © {year} {tenantName}. {copyrightNote}
      </p>
    </footer>
  );
}
