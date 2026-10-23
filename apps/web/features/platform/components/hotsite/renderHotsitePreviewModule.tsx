import type { HotsiteModuleType } from '@ikaro/types';
import type { HotsiteModuleRenderPlanItem } from '@/features/platform/hotsite/page-model';
import { HotsiteModuleView } from '@/shells/hotsite/components/HotsiteModuleView';
import { PreviewSelectionWrapper } from './PreviewSelectionWrapper';
import type { PreviewSupplementaryData } from './useHotsitePreviewData';

export interface PreviewSelection {
  readonly selectedType: HotsiteModuleType | null;
  readonly onSelect: (type: HotsiteModuleType) => void;
}

interface RenderContext {
  readonly tenantSlug: string;
  readonly tenantBrand: { name: string; tagline?: string } | undefined;
  readonly logoUrl: string;
  readonly data: PreviewSupplementaryData;
}

// With `selection`, each module is wrapped in the editor-only selection boundary; without it the
// output is exactly the public module tree (the detailed editor's Preview).
export function renderHotsitePreviewModule(
  item: HotsiteModuleRenderPlanItem,
  index: number,
  ctx: RenderContext & { readonly selection?: PreviewSelection },
): React.JSX.Element | null {
  const { selection, ...renderCtx } = ctx;
  const content = renderModuleContent(item, index, renderCtx);
  if (!selection || !content) return content;
  const { parsed } = item;
  return (
    <PreviewSelectionWrapper
      key={`${parsed.type}-${index}`}
      type={parsed.type}
      selected={selection.selectedType === parsed.type}
      fixedOverlay={parsed.type === 'CHATBOT' && (parsed.data.variant ?? 'bubble') === 'bubble'}
      onSelect={selection.onSelect}
    >
      {content}
    </PreviewSelectionWrapper>
  );
}

function renderModuleContent(
  item: HotsiteModuleRenderPlanItem,
  index: number,
  ctx: RenderContext,
): React.JSX.Element | null {
  const { tenantSlug, tenantBrand, logoUrl, data } = ctx;
  // The very component the public page renders (HotsiteModuleView), fed from the preview's own
  // supplementary data — so the preview and the published site cannot drift apart.
  return (
    <HotsiteModuleView
      key={`${item.parsed.type}-${index}`}
      item={item}
      slug={tenantSlug}
      tenantName={data.tenantName}
      tenantBrand={tenantBrand}
      logoUrl={logoUrl}
      business={data.business}
      services={data.services}
    />
  );
}
