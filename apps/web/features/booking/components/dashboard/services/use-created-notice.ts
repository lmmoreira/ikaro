import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type { FeedbackModel } from '@/shared/components/ui/feedback-message';

interface CreatedNotice {
  readonly notice: FeedbackModel | null;
  readonly dismiss: () => void;
}

// A service created from the create page lands here with `?created=1`. The success shows in the
// Detalhes pane until the next edit or save (no timer), and the URL is cleaned once so a reload
// does not show it again.
export function useCreatedNotice(arrivedFromCreate: boolean, serviceId: string): CreatedNotice {
  const t = useTranslations('dashboard.servicesPage');
  const router = useRouter();
  const [visible, setVisible] = useState(arrivedFromCreate);
  const title = t('createdSuccessTitle');
  const body = t('createdSuccessBody');

  const urlCleaned = useRef(false);
  useEffect(() => {
    if (!arrivedFromCreate || urlCleaned.current) return;
    urlCleaned.current = true;
    router.replace(`/dashboard/services/${serviceId}/edit`, { scroll: false });
  }, [arrivedFromCreate, router, serviceId]);

  const notice = useMemo<FeedbackModel | null>(
    () => (visible ? { variant: 'success', title, body } : null),
    [visible, title, body],
  );

  return { notice, dismiss: () => setVisible(false) };
}
