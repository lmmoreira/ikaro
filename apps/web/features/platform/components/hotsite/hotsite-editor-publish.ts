'use client';

import type { HotsiteAdminContentResponse } from '@ikaro/types';
import { materializeLayout } from '@/features/platform/hotsite/default-layout';
import { stripResolvedImageUrls } from '@/features/platform/hotsite/strip-resolved-image-urls';
import { resolveErrorMessageFromApiError } from '@/shared/lib/i18n/resolve-error-message';
import type { ActionBanner } from './HotsiteEditorMainView';
import type { LeadFormConfigDraft } from './hotsite-editor-views';
import { stripLeadFormConfig } from './hotsite-editor-views';

type HotsiteMutation = {
  mutateAsync: (body: {
    branding: HotsiteAdminContentResponse['branding'];
    layout: HotsiteAdminContentResponse['layout'];
    seo: HotsiteAdminContentResponse['seo'];
    audienceMode?: LeadFormConfigDraft['audienceMode'];
    questions?: LeadFormConfigDraft['questions'];
  }) => Promise<HotsiteAdminContentResponse>;
};

type PublishMutation = { mutateAsync: () => Promise<unknown> };
type SetDraft = (
  updater: (current: HotsiteAdminContentResponse) => HotsiteAdminContentResponse,
) => void;

type PublishArgs = {
  readonly content: HotsiteAdminContentResponse;
  readonly leadFormConfig: LeadFormConfigDraft | null;
  readonly tenantId: string;
  readonly locale: 'pt-BR' | 'en';
  readonly updateConfig: HotsiteMutation;
  readonly publishHotsite: PublishMutation;
  readonly setDraft: SetDraft;
  readonly onTabs: () => void;
  readonly onBanner: (banner: ActionBanner) => void;
};

export async function executeHotsitePublish(args: PublishArgs): Promise<void> {
  const { locale, publishHotsite, onTabs, onBanner } = args;
  try {
    await persistDraft(args);
    await publishHotsite.mutateAsync();
    onTabs();
    onBanner({ kind: 'publish', status: 'success' });
  } catch (error) {
    onTabs();
    onBanner({
      kind: 'publish',
      status: 'error',
      message: resolveErrorMessageFromApiError(error, locale),
    });
  }
  globalThis.scrollTo?.({ top: 0, behavior: 'smooth' });
}

// One consolidated PATCH /v1/tenants/hotsite call, always — audienceMode/questions are optional
// extra fields on that same request when the manager is publishing from the LEAD_FORM module's
// own screen (M20-S08, folded into this endpoint; see UpdateHotsiteContentUseCase's own header
// comment on the backend — previously two separate, near-duplicate mutations/endpoints). The
// LEAD_FORM layout entry's own audienceMode/questions must never reach the backend inline via
// layout[] — they live in a separate LeadFormConfig aggregate that HotsiteConfig.layout[] (the
// public-manifest-cached blob) must never carry.
async function persistDraft({
  content,
  leadFormConfig,
  tenantId,
  updateConfig,
  setDraft,
}: PublishArgs): Promise<void> {
  const stripped = stripResolvedImageUrls(content.branding, content.layout, content.seo, tenantId);
  const layout = leadFormConfig
    ? stripped.layout.map((module) =>
        module.type === 'LEAD_FORM'
          ? { ...module, data: stripLeadFormConfig(module.data) }
          : module,
      )
    : stripped.layout;

  const updated = await updateConfig.mutateAsync({
    branding: stripped.branding,
    layout,
    seo: stripped.seo,
    ...(leadFormConfig ?? {}),
  });

  setDraft((current) => ({ ...current, ...updated, layout: materializeLayout(updated.layout) }));
}
