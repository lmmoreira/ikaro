'use client';

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import type { FeedbackModel } from '@/shared/components/ui/feedback-message';

export type ActionBanner = {
  readonly kind: 'publish' | 'unpublish';
  readonly status: 'success' | 'error';
  readonly message?: string;
};

export const ACTION_SUCCESS_TEST_ID = 'hotsite-action-success-banner';
export const ACTION_ERROR_TEST_ID = 'hotsite-action-error-banner';

// The publish/unpublish result as the shared feedback model, so the detailed editor (in its action
// pane) and the visual editor (in its top slot) report an action the same way and keep one set of
// test ids.
export function useHotsiteActionFeedback(
  banner: ActionBanner | null,
  tenantSlug: string,
): FeedbackModel | null {
  const t = useTranslations('dashboard.hotsitePage');

  return useMemo<FeedbackModel | null>(() => {
    if (banner?.status === 'success') {
      const isPublish = banner.kind === 'publish';
      return {
        variant: 'success',
        title: t(isPublish ? 'publishSuccessTitle' : 'unpublishSuccessTitle'),
        body: t(isPublish ? 'publishSuccessBody' : 'unpublishSuccessBody', { slug: tenantSlug }),
        testId: ACTION_SUCCESS_TEST_ID,
      };
    }
    if (banner?.status === 'error') {
      return { variant: 'error', title: banner.message ?? '', testId: ACTION_ERROR_TEST_ID };
    }
    return null;
  }, [banner, tenantSlug, t]);
}
