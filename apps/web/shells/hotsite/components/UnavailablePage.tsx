import type { HotsiteManifestResponse } from '@ikaro/types';
import type React from 'react';
import {
  resolveHotsiteDisplayName,
  resolveHotsiteNavigationCta,
  resolveManifestNavigation,
} from '@/features/platform/hotsite/page-model';
import { HotsiteAuthBar } from './HotsiteAuthBar';
import { Unavailable } from './Unavailable';

interface UnavailablePageProps {
  readonly slug: string;
  readonly manifest: Pick<HotsiteManifestResponse, 'branding' | 'layout' | 'tenant'>;
}

// The page every public hotsite route renders when it is unavailable (UC-122): the top bar, so the
// team and customers can still log in, over the reason-neutral message. An unpublished manifest
// stubs `layout: []`, so the bar carries no navigation; a published hotsite whose lead-form module
// is disabled keeps its own navigation.
export function UnavailablePage({ slug, manifest }: UnavailablePageProps): React.JSX.Element {
  return (
    <>
      <HotsiteAuthBar
        slug={slug}
        logoUrl={manifest.branding.logoUrl}
        tenantName={resolveHotsiteDisplayName(manifest)}
        navigation={resolveManifestNavigation(manifest)}
        navigationCta={resolveHotsiteNavigationCta(manifest.layout)}
      />
      <Unavailable />
    </>
  );
}
