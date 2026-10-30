'use client';

import { useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import type { StaffServiceResponse } from '@ikaro/types';
import { useUpdateServicePublicPage } from '@/features/booking/services/useServices';
import { useFormFeedback } from '@/shared/lib/feedback/use-form-feedback';
import { useResolvedLocale } from '@/shared/lib/i18n/use-resolved-locale';
import { useTenant } from '@/providers/tenant-provider';
import {
  useRegisterTabAction,
  useTabFeedback,
  type ServiceTabActionChange,
} from './service-tab-action';
import {
  toPublicPageDraft,
  toPublicPageProfileRequest,
  type PublicPageDraft,
} from './service-public-page-draft';
import { ServicePublicPageContent } from './ServicePublicPageContent';
import { ServicePublicPageImages } from './ServicePublicPageImages';
import { ServicePublicPageSwitchCard } from './ServicePublicPageSwitchCard';

interface ServicePublicPageTabProps {
  readonly service: StaffServiceResponse;
  // Live (not the saved flag): the service may have been deactivated or reactivated in this session.
  readonly isActive: boolean;
  readonly onDirtyChange: (dirty: boolean) => void;
  readonly onActionChange: ServiceTabActionChange;
}

// UC-013 A5 (TD56-S03) — the "Página pública" tab: publish switch + the page's content. Saves on its
// own button like the other config tabs (PATCH /services/:id/public-page, one request carrying the
// switch and the whole profile). The address of the page is never shown or typed: the backend
// generates it on the first publish, and the link below opens the page once it is live.
export function ServicePublicPageTab({
  service,
  isActive,
  onDirtyChange,
  onActionChange,
}: ServicePublicPageTabProps): React.JSX.Element {
  const t = useTranslations('dashboard.servicesPage');
  const locale = useResolvedLocale();
  const { tenantId, tenantSlug, role } = useTenant();
  const updatePublicPage = useUpdateServicePublicPage();

  const [published, setPublished] = useState(service.publicPagePublished);
  const [draft, setDraft] = useState<PublicPageDraft>(() =>
    toPublicPageDraft(service.publicProfile),
  );
  // What is actually live: the last saved switch and the address the backend generated.
  const [saved, setSaved] = useState({
    published: service.publicPagePublished,
    slug: service.publicSlug,
  });
  const form = useFormFeedback();
  const feedback = useTabFeedback(form);
  // Bumped on every edit — a save in flight must not clear the dirty flag for an edit made after it
  // was sent (same guard as the other tabs).
  const editRevisionRef = useRef(0);

  function touch(): void {
    editRevisionRef.current += 1;
    form.clear();
    onDirtyChange(true);
  }

  function patchDraft(next: Partial<PublicPageDraft>): void {
    setDraft((current) => ({ ...current, ...next }));
    touch();
  }

  async function handleSave(): Promise<void> {
    form.clear();
    const revisionAtSubmit = editRevisionRef.current;
    try {
      const result = await updatePublicPage.mutateAsync({
        id: service.serviceId,
        body: { published, profile: toPublicPageProfileRequest(draft, tenantId) },
      });
      setSaved({ published: result.publicPagePublished, slug: result.publicSlug });
      if (editRevisionRef.current === revisionAtSubmit) {
        // Adopt what the backend stored: a tmp upload comes back as its permanent path.
        setDraft(toPublicPageDraft(result.publicProfile));
        onDirtyChange(false);
        form.setSuccess(t('publicPageSavedBody'));
      }
    } catch (err) {
      form.setFromApiError(err, locale);
    }
  }

  useRegisterTabAction(onActionChange, {
    label: t('publicPageSaveButton'),
    disabled: updatePublicPage.isPending,
    pending: updatePublicPage.isPending,
    onSubmit: handleSave,
    feedback,
  });

  const liveHref = saved.published && saved.slug ? `/${tenantSlug}/servicos/${saved.slug}` : null;

  return (
    <div className="space-y-4">
      <ServicePublicPageSwitchCard
        published={published}
        onPublishedChange={(next) => {
          setPublished(next);
          touch();
        }}
        liveHref={liveHref}
        serviceActive={isActive}
      />
      <ServicePublicPageImages
        cover={draft.coverImageUrl}
        gallery={draft.galleryImageUrls}
        onCoverChange={(path) => patchDraft({ coverImageUrl: path })}
        onGalleryChange={(paths) => patchDraft({ galleryImageUrls: paths })}
        canUpload={role === 'MANAGER'}
      />
      <ServicePublicPageContent
        longDescription={draft.longDescription}
        inclusions={draft.inclusions}
        preparationNotes={draft.preparationNotes}
        onLongDescriptionChange={(value) => patchDraft({ longDescription: value })}
        onInclusionsChange={(items) => patchDraft({ inclusions: items })}
        onPreparationNotesChange={(value) => patchDraft({ preparationNotes: value })}
      />
    </div>
  );
}
