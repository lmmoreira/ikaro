'use client';

import { useTranslations } from 'next-intl';
import type { HotsiteAdminContentResponse } from '@ikaro/types';
import { Card, CardContent } from '@/shared/components/ui/card';
import { Button } from '@/shared/components/ui/button';
import { MOBILE_ACTION_BAR_CLEARANCE_CLASS } from '@/shells/dashboard/utils/mobile-action-bar';
import { HotsitePreviewCanvas } from './HotsitePreviewCanvas';

export interface HotsitePreviewProps {
  readonly draft: HotsiteAdminContentResponse;
  readonly onPublish: () => void;
  readonly isPublishing: boolean;
}

// The detailed editor's standalone Preview page: the shared draft canvas plus its own publish
// chrome (22rem desktop card, fixed mobile bar). The visual editor renders HotsitePreviewCanvas
// directly instead.
export function HotsitePreview({
  draft,
  onPublish,
  isPublishing,
}: HotsitePreviewProps): React.JSX.Element {
  const t = useTranslations('dashboard.hotsitePage.previewView');

  return (
    <div className="space-y-4 pb-28 lg:space-y-6 lg:pb-0">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
        <HotsitePreviewCanvas draft={draft} />

        <aside className="hidden lg:block lg:sticky lg:top-6">
          <Card>
            <CardContent className="space-y-4 p-4">
              <p className="text-sm leading-6 text-gray-500">{t('viewingDraftLabel')}</p>
              <Button
                type="button"
                className="w-full"
                onClick={onPublish}
                disabled={isPublishing}
                data-testid="hotsite-preview-publish-desktop"
              >
                {t('publishNow')}
              </Button>
            </CardContent>
          </Card>
        </aside>
      </div>

      <div
        className={`fixed inset-x-0 ${MOBILE_ACTION_BAR_CLEARANCE_CLASS} z-20 flex gap-3 border-t border-gray-200 bg-white p-4 shadow-[0_-2px_8px_rgba(0,0,0,0.06)] lg:hidden`}
      >
        <Button
          type="button"
          className="w-full"
          onClick={onPublish}
          disabled={isPublishing}
          data-testid="hotsite-preview-publish-mobile"
        >
          {t('publishNow')}
        </Button>
      </div>
    </div>
  );
}
