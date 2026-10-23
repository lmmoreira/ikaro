import { useTranslations } from 'next-intl';
import Image from 'next/image';
import type { HotsiteNavigationItem } from '@ikaro/types';
import { HotsiteNavigation } from './HotsiteNavigation';

interface HotsiteAuthBarSignedOutProps {
  readonly slug: string;
  readonly logoUrl: string;
  readonly tenantName: string;
  readonly navigation?: readonly HotsiteNavigationItem[];
}

// Brand mark, left-most element — see journeys/shared/hotsite.html's topbar section for the
// validated size/placement (28px circle, ahead of the staff-area link). Falls back to an
// initial-letter badge when no logo is uploaded yet, same pattern as app/[slug]/login/page.tsx.
export function BrandMark({
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
      width={28}
      height={28}
      className="h-7 w-7 flex-shrink-0 rounded-full object-cover"
    />
  ) : (
    <div
      className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold"
      style={{ backgroundColor: 'var(--ba-primary)', color: 'var(--ba-btn-text)' }}
    >
      {tenantName.charAt(0).toUpperCase()}
    </div>
  );
}

export function BriefcaseIcon(): React.JSX.Element {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
      <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
    </svg>
  );
}

// The muted "Área da Equipe" link every bar shows unless a staff member is signed in.
export function StaffAreaLink({ slug }: { readonly slug: string }): React.JSX.Element {
  const t = useTranslations('auth');

  return (
    <a
      href={`/dashboard/login?tenantSlug=${encodeURIComponent(slug)}`}
      data-testid="hotsite-staff-link"
      className="flex items-center gap-1.5 border-l pl-3 text-[0.8125rem] font-medium no-underline opacity-40"
      style={{
        color: 'var(--ba-secondary-text, var(--ba-text))',
        borderColor: 'var(--ba-secondary-divider, rgba(17,24,39,0.12))',
      }}
    >
      <BriefcaseIcon />
      {t('staffArea')}
    </a>
  );
}

// The public bar for a visitor with no session. Presentational only — it never reads the session —
// so the public HotsiteAuthBar and the visual editor's preview canvas render the very same markup
// and cannot drift apart.
export function HotsiteAuthBarSignedOut({
  slug,
  logoUrl,
  tenantName,
  navigation = [],
}: HotsiteAuthBarSignedOutProps): React.JSX.Element {
  const t = useTranslations('auth');

  return (
    <header
      className="relative flex h-12 items-center justify-between px-6"
      style={{ backgroundColor: 'var(--ba-secondary)' }}
      data-testid="hotsite-auth-bar"
    >
      <div className="flex items-center gap-3">
        <BrandMark logoUrl={logoUrl} tenantName={tenantName} />
        <StaffAreaLink slug={slug} />
      </div>
      <HotsiteNavigation items={navigation} slug={slug} />
      <a
        href={`/${slug}/login`}
        data-testid="hotsite-login-link"
        className="text-sm font-medium"
        style={{ color: 'var(--ba-primary)' }}
      >
        {t('signIn')}
      </a>
    </header>
  );
}
