import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { fetchManifest } from '@/features/platform/api.server';
import { LeadFormWidget } from '@/features/platform/components/public/LeadFormWidget';
import { HotsiteAuthBar } from '@/shells/hotsite/components/HotsiteAuthBar';
import { Unavailable } from '@/shells/hotsite/components/Unavailable';
import { buildHotsiteMetadata } from '@/features/platform/hotsite/seo';
import { resolveLeadFormModule } from '@/features/platform/hotsite/lead-form-module';
import { resolveHotsiteDisplayName } from '@/features/platform/hotsite/page-model';

export const revalidate = 300;

interface LeadFormPageProps {
  readonly params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: LeadFormPageProps): Promise<Metadata> {
  const { slug } = await params;
  const manifest = await fetchManifest(slug);
  const tHotsite = await getTranslations('hotsite');
  const { available, data } = resolveLeadFormModule(manifest);

  return {
    ...(await buildHotsiteMetadata({ manifest, slug, path: '/lead-form' })),
    title: available && data ? data.title : `${tHotsite('unavailable.label')} — Ikaro`,
    robots: { index: false, follow: false },
  };
}

// Disabled-module handling is new logic for this page — unlike /[slug]/booking (which only
// checks manifest.isPublished), /[slug]/lead-form checks the LEAD_FORM module's own `enabled`
// flag directly (docs/15-HOTSITE_DYNAMIC_ARCHITECTURE.md § LEAD_FORM). An unpublished hotsite
// already stubs `layout: []` at the source (docs/14-API_CONTRACTS.md), so the "module not found"
// branch below covers that case too, with no separate isPublished check needed.
export default async function LeadFormPage({ params }: LeadFormPageProps) {
  const { slug } = await params;
  const manifest = await fetchManifest(slug);
  const { available, data } = resolveLeadFormModule(manifest);

  if (!available || !data) {
    return <Unavailable />;
  }

  const displayName = resolveHotsiteDisplayName(manifest);

  return (
    <>
      <HotsiteAuthBar slug={slug} logoUrl={manifest.branding.logoUrl} tenantName={displayName} />
      <LeadFormWidget slug={slug} title={data.title} subtitle={data.subtitle} />
    </>
  );
}
