'use client';

import type { HotsiteAdminContentResponse, HotsiteModuleType } from '@ikaro/types';
import { HotsitePreview } from './hotsite-editor-lazy-panels';
import {
  extractLeadFormConfig,
  hasInvalidLeadFormQuestion,
  mergeLocalDataIntoLayout,
  type LeadFormConfigDraft,
} from './hotsite-editor-views';

interface ModuleConfigPreviewScreenProps {
  readonly draft: HotsiteAdminContentResponse;
  readonly type: HotsiteModuleType;
  readonly localData: Record<string, unknown>;
  readonly isPublishing: boolean;
  readonly onPublish: (
    content: HotsiteAdminContentResponse,
    leadFormConfig?: LeadFormConfigDraft,
  ) => void;
  readonly onPublishBlocked: () => void;
}

// The detailed editor's Preview opened from inside a module's config screen: the shared draft with
// that module's unapplied edits merged in, publishable straight from here.
export function ModuleConfigPreviewScreen({
  draft,
  type,
  localData,
  isPublishing,
  onPublish,
  onPublishBlocked,
}: ModuleConfigPreviewScreenProps): React.JSX.Element {
  const previewDraft: HotsiteAdminContentResponse = {
    ...draft,
    layout: mergeLocalDataIntoLayout(draft.layout, type, localData),
  };
  const leadFormConfig = type === 'LEAD_FORM' ? extractLeadFormConfig(localData) : undefined;
  // Publishing straight from this preview skips applyModuleConfig's own gate (the "Aplicar"
  // path), so an invalid lead-form config must be re-checked here — otherwise this is the one
  // path that can send it to the backend unvalidated (CodeRabbit finding, PR #429).
  const leadFormInvalid =
    type === 'LEAD_FORM' && (!leadFormConfig || hasInvalidLeadFormQuestion(leadFormConfig));

  return (
    <HotsitePreview
      draft={previewDraft}
      onPublish={() => {
        if (leadFormInvalid) {
          onPublishBlocked();
          return;
        }
        onPublish(previewDraft, leadFormConfig ?? undefined);
      }}
      isPublishing={isPublishing}
    />
  );
}
