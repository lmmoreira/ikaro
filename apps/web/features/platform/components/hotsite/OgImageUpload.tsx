'use client';

import { useTranslations } from 'next-intl';
import { SingleImageUploadField } from './SingleImageUploadField';

interface OgImageUploadProps {
  readonly value: string;
  readonly onChange: (ogImageUrl: string) => void;
}

const FIELD_ID = 'hotsite-seo-og-image';

// Thin wrapper: supplies the seo-og-image-specific purpose, large preview size, and translated
// labels to the shared SingleImageUploadField — same shape as LogoUpload.tsx, but landscape
// (1.91:1, auto-cropped — see compressImage's targetAspectRatio) instead of square. Reuses the
// generic click-to-add/uploading/uploadError copy from the branding namespace (identical wording
// regardless of field) and only adds field-specific label/hint/remove copy (M18-S03).
export function OgImageUpload({ value, onChange }: OgImageUploadProps): React.JSX.Element {
  const tSeo = useTranslations('dashboard.hotsitePage.seo');
  const tBranding = useTranslations('dashboard.hotsitePage.branding');

  return (
    <SingleImageUploadField
      id={FIELD_ID}
      value={value}
      onChange={onChange}
      purpose="seo-og-image"
      previewSize="large"
      label={tSeo('ogImageLabel')}
      clickToAddLabel={tBranding('logoClickToAdd')}
      formatHintLabel={tSeo('ogImageFormatHint')}
      uploadingLabel={tBranding('logoUploading')}
      uploadErrorLabel={tBranding('logoUploadError')}
      removeLabel={tSeo('ogImageRemove')}
    />
  );
}
