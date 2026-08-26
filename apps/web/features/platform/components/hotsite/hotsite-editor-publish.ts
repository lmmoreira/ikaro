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
  }) => Promise<HotsiteAdminContentResponse>;
};

type LeadFormMutation = {
  mutateAsync: (body: Record<string, unknown>) => Promise<unknown>;
};

type PublishMutation = { mutateAsync: () => Promise<unknown> };
type SetDraft = (
  updater: (current: HotsiteAdminContentResponse) => HotsiteAdminContentResponse,
) => void;
type StrippedContent = Pick<HotsiteAdminContentResponse, 'branding' | 'layout' | 'seo'>;

type PublishArgs = {
  readonly content: HotsiteAdminContentResponse;
  readonly leadFormConfig: LeadFormConfigDraft | null;
  readonly tenantId: string;
  readonly locale: 'pt-BR' | 'en';
  readonly updateConfig: HotsiteMutation;
  readonly updateLeadFormConfig: LeadFormMutation;
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

async function persistDraft({
  content,
  leadFormConfig,
  tenantId,
  updateConfig,
  updateLeadFormConfig,
  setDraft,
}: PublishArgs): Promise<void> {
  const stripped = stripResolvedImageUrls(content.branding, content.layout, content.seo, tenantId);
  if (leadFormConfig) {
    await persistLeadFormDraft(content, stripped, leadFormConfig, updateLeadFormConfig, setDraft);
    return;
  }
  const updated = await updateConfig.mutateAsync({
    branding: stripped.branding,
    layout: stripped.layout,
    seo: stripped.seo,
  });
  setDraft((current) => ({ ...current, ...updated, layout: materializeLayout(updated.layout) }));
}

async function persistLeadFormDraft(
  content: HotsiteAdminContentResponse,
  stripped: StrippedContent,
  leadFormConfig: LeadFormConfigDraft,
  updateLeadFormConfig: LeadFormMutation,
  setDraft: SetDraft,
): Promise<void> {
  const leadFormModule = stripped.layout.find((module) => module.type === 'LEAD_FORM');
  await updateLeadFormConfig.mutateAsync({
    branding: stripped.branding,
    layout: stripped.layout.map((module) =>
      module.type === 'LEAD_FORM' ? { ...module, data: stripLeadFormConfig(module.data) } : module,
    ),
    seo: stripped.seo,
    ...stripLeadFormConfig((leadFormModule?.data ?? {}) as Record<string, unknown>),
    ...leadFormConfig,
  });
  setDraft((current) => ({
    ...current,
    branding: content.branding,
    layout: materializeLayout(stripped.layout),
    seo: content.seo,
  }));
}
