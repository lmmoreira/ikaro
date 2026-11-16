'use client';

import { Lock } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { FeatureKey } from '@ikaro/types';
import { Badge } from '@/shared/components/ui/badge';
import { Card } from '@/shared/components/ui/card';

interface LockedFeatureCardProps {
  readonly feature: FeatureKey;
  // `page`: the whole route is locked (`03b`). `section`: one section of a page is locked and the
  // rest stays editable (`03`, the Chatbot section of Configurações).
  readonly variant: 'page' | 'section';
}

// The "Recurso não contratado" card (UC-125, prototypes `03` / `03b`). It carries no buy action in
// M25: the Plano tab and the billing page it would point to are M26's, which adds them here.
export function LockedFeatureCard({ feature, variant }: LockedFeatureCardProps): React.JSX.Element {
  const t = useTranslations('dashboard.billing.locked');
  const isPage = variant === 'page';

  return (
    <Card className="p-6" data-testid="locked-feature-card" data-feature={feature}>
      <div className="flex flex-wrap items-start gap-4">
        <div
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-600"
          aria-hidden="true"
        >
          <Lock className="h-5 w-5" />
        </div>
        <div className="min-w-56 flex-1">
          <div className="mb-1.5 flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-bold text-gray-900">
              {isPage ? t('directUrl.title') : t('title')}
            </h2>
            <Badge variant="neutral">{t('badge')}</Badge>
          </div>
          <p className="mb-3 text-[0.9375rem] leading-relaxed text-gray-900">
            {t(`features.${feature}.description`)}
          </p>
          <p className="mb-4 text-sm leading-normal text-gray-600">{t('deferredStart')}</p>
          <div
            className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm leading-normal text-green-800"
            data-testid="locked-feature-kept"
          >
            {isPage ? t('directUrl.body') : t('settingsKept')}
          </div>
        </div>
      </div>
    </Card>
  );
}
