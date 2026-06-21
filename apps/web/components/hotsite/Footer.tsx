import type { FooterModuleData, HotsiteBusinessInfoResponse } from '@ikaro/types';

interface FooterProps {
  readonly slug: string;
  readonly data: FooterModuleData;
  readonly tenantName: string;
  readonly business: HotsiteBusinessInfoResponse;
}

function digitsOnly(value: string): string {
  return value.replace(/\D/g, '');
}

export function Footer({ slug: _, data, tenantName, business }: FooterProps): React.JSX.Element {
  const whatsapp = business.socialLinks?.whatsapp;
  const showWhatsapp = data.showWhatsapp !== false;
  const year = new Date().getFullYear();
  const copyrightNote = data.copyrightNote ?? 'Todos os direitos reservados.';

  return (
    <footer
      style={{
        backgroundColor: 'var(--ba-secondary)',
        color: 'var(--ba-text)',
        padding: '2.5rem 1.5rem',
        textAlign: 'center',
      }}
    >
      <div
        className="text-lg font-black uppercase tracking-widest"
        style={{ color: 'var(--ba-primary)' }}
        data-testid="footer-brand-name"
      >
        {tenantName}
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
            borderRadius: 'var(--ba-radius)',
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
