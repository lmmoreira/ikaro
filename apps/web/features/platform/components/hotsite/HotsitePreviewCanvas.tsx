'use client';

import { useTranslations } from 'next-intl';
import type { HotsiteAdminContentResponse } from '@ikaro/types';
import { useTenant } from '@/providers/tenant-provider';
import { applyBranding } from '@/features/platform/hotsite/apply-branding';
import { getActiveFontVariables } from '@/features/platform/hotsite/font-config';
import { HotsiteAuthBarSignedOut } from '@/shells/hotsite/components/HotsiteAuthBarSignedOut';
import {
  buildHotsiteModuleRenderPlan,
  resolveHotsiteNavigation,
} from '@/features/platform/hotsite/page-model';
import { resolveDraftImageUrls } from '@/features/platform/hotsite/resolve-draft-image-urls';
import { hotsiteImageBaseUrl } from '@/features/platform/hotsite/resolve-hotsite-image-url';
import { usePreviewSupplementaryData, useTmpSignedUrls } from './useHotsitePreviewData';
import { renderHotsitePreviewModule, type PreviewSelection } from './renderHotsitePreviewModule';

export interface HotsitePreviewCanvasProps {
  readonly draft: HotsiteAdminContentResponse;
  // Present only in the visual editor: turns every module into an editor-selectable section.
  // Absent (the legacy Preview), the canvas renders exactly the public hotsite modules.
  readonly selection?: PreviewSelection;
}

// The branded draft frame, without any publish chrome — shared by the legacy Preview page and the
// visual editor. It renders the in-memory draft only; nothing here is persisted.
export function HotsitePreviewCanvas({
  draft,
  selection,
}: HotsitePreviewCanvasProps): React.JSX.Element {
  const t = useTranslations('dashboard.hotsitePage.previewView');
  const { tenantSlug } = useTenant();
  // A field the admin just uploaded this session holds the raw storage path the upload flow
  // returned, not yet resolved to a public URL (resolution only happens server-side on the next
  // GET) — next/image's `src` requires an absolute URL, so resolve every image field before
  // rendering. Untouched fields already hold a resolved URL and pass through unchanged.
  const tmpSignedUrls = useTmpSignedUrls(draft.branding, draft.layout, draft.seo);
  const { branding, layout } = resolveDraftImageUrls(
    draft.branding,
    draft.layout,
    draft.seo,
    hotsiteImageBaseUrl(),
    tmpSignedUrls,
  );
  const alternateSectionBg = branding.alternateSectionBg ?? false;
  const modulesWithVariant = buildHotsiteModuleRenderPlan(layout, alternateSectionBg, branding);
  const navigation = resolveHotsiteNavigation(layout, modulesWithVariant);
  const hasServiceList = modulesWithVariant.some(({ parsed }) => parsed.type === 'SERVICE_LIST');
  const { data, loadError } = usePreviewSupplementaryData(tenantSlug, hasServiceList);
  const tenantBrand = branding.brandName
    ? { name: branding.brandName, tagline: branding.brandTagline }
    : undefined;

  return (
    // The inline transform establishes a new CSS containing block for any `position: fixed`
    // descendant (e.g. ChatbotWidget's bubble variant) — without it, "fixed" resolves
    // against the real browser viewport, pinning the bubble to the dashboard shell's corner
    // instead of this preview frame. translateZ(0) is a no-visual-effect way to opt into
    // that containment; overflow-hidden then actually clips it to the frame.
    <div
      className="overflow-hidden rounded-md border border-gray-200"
      style={{ transform: 'translateZ(0)' }}
    >
      {loadError && (
        <div
          role="alert"
          data-testid="hotsite-preview-load-error"
          className="p-4 text-sm text-red-700"
        >
          {t('loadError')}
        </div>
      )}
      {!data && !loadError && (
        <div
          data-testid="hotsite-preview-loading"
          className="p-8 text-center text-sm text-gray-500"
        >
          {t('loading')}
        </div>
      )}
      {data && (
        // applyBranding() only defines the --ba-* variables; it never paints a background. The
        // frame must paint --ba-background itself, or a tenant with light text on a dark
        // background falls through to the browser's white (docs/ENGINEERING_RULES_FRONTEND.md
        // § Hotsite full-page components must explicitly paint --ba-background).
        <div
          data-testid="hotsite-preview-content"
          style={{
            ...applyBranding(branding),
            fontFamily: 'var(--ba-body-font)',
            backgroundColor: 'var(--ba-background)',
          }}
          className={getActiveFontVariables(
            branding.headingFontFamily,
            branding.bodyFontFamily,
          ).join(' ')}
        >
          {/* The public bar as a logged-out visitor sees it, so the logo and Branding colours show
              where they actually appear. Preview-only chrome: inert (no link is followable or
              focusable), outside the selection wrapper and the module render plan, and
              session-free — it never reflects the signed-in manager. */}
          <div inert className="pointer-events-none" data-testid="hotsite-preview-auth-bar">
            <HotsiteAuthBarSignedOut
              slug={tenantSlug}
              logoUrl={branding.logoUrl}
              tenantName={branding.brandName || data.tenantName}
              navigation={navigation}
            />
          </div>
          {modulesWithVariant.map((moduleWithVariant, index) =>
            renderHotsitePreviewModule(moduleWithVariant, index, {
              tenantSlug,
              tenantBrand,
              logoUrl: branding.logoUrl,
              data,
              selection,
            }),
          )}
        </div>
      )}
    </div>
  );
}
