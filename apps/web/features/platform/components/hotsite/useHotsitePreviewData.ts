import { useEffect, useState } from 'react';
import type {
  HotsiteAdminContentResponse,
  HotsiteBusinessInfoResponse,
  HotsiteServiceResponse,
} from '@ikaro/types';
import { fetchManifestClient } from '@/features/platform/api';
import { fetchServicesClient } from '@/features/platform/hotsite/api/services';
import { resolveHotsiteDisplayName } from '@/features/platform/hotsite/page-model';
import { collectHotsiteImagePaths } from '@/features/platform/hotsite/map-hotsite-image-fields';
import { isTmpImagePath } from '@/features/platform/hotsite/resolve-hotsite-image-url';
import { generateHotsiteImageReadSignedUrl } from '@/features/platform/api/tenant-settings';

export interface PreviewSupplementaryData {
  readonly business: HotsiteBusinessInfoResponse;
  readonly tenantName: string;
  readonly services: readonly HotsiteServiceResponse[];
}

// services/business/tenant name aren't part of the editable draft — they're read-only context
// sourced from the public manifest, fetched once when Preview opens (not on every draft edit).
export function usePreviewSupplementaryData(
  tenantSlug: string,
  hasServiceList: boolean,
): { data: PreviewSupplementaryData | null; loadError: boolean } {
  const [data, setData] = useState<PreviewSupplementaryData | null>(null);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load(): Promise<void> {
      try {
        const manifest = await fetchManifestClient(tenantSlug);
        const services = hasServiceList ? await fetchServicesClient(tenantSlug) : [];
        if (cancelled) return;
        setData({
          business: manifest.business,
          tenantName: resolveHotsiteDisplayName({
            branding: manifest.branding,
            tenant: manifest.tenant,
          }),
          services,
        });
      } catch {
        if (!cancelled) setLoadError(true);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [tenantSlug, hasServiceList]);

  return { data, loadError };
}

// A not-yet-promoted tmp/ upload lives in the private bucket — it can't resolve via the public
// base URL, so Preview needs a fresh private signed read URL per tmp/ path before rendering
// (see td/TD22-ORPHANED-UPLOAD-CLEANUP.md § tmp/ image preview).
export function useTmpSignedUrls(
  branding: HotsiteAdminContentResponse['branding'],
  layout: HotsiteAdminContentResponse['layout'],
  seo: HotsiteAdminContentResponse['seo'],
): ReadonlyMap<string, string> {
  const [signedUrls, setSignedUrls] = useState<ReadonlyMap<string, string>>(new Map());

  useEffect(() => {
    // Deduped — the same tmp/ path can appear in more than one field (e.g. a reused image), and
    // fetching a signed URL for it once is enough.
    const tmpPaths = [
      ...new Set(collectHotsiteImagePaths(branding, layout, seo).filter(isTmpImagePath)),
    ];
    if (tmpPaths.length === 0) return;

    let cancelled = false;
    // Each path's signed-URL request is isolated (catch -> null) so one failing path doesn't
    // discard every other path's already-successful result — Promise.all otherwise rejects the
    // whole batch on a single failure, silently dropping resolved URLs the "best-effort" comment
    // below implies should still apply (CodeRabbit review, PR #291).
    Promise.all(
      tmpPaths.map(async (path) => {
        try {
          return [path, await generateHotsiteImageReadSignedUrl(path)] as const;
        } catch {
          return null;
        }
      }),
    ).then((resolved) => {
      if (cancelled) return;
      setSignedUrls((prev) => {
        const next = new Map(prev);
        for (const result of resolved) {
          if (result) next.set(result[0], result[1].signedUrl);
        }
        return next;
      });
    });
    return () => {
      cancelled = true;
    };
  }, [branding, layout, seo]);

  return signedUrls;
}
