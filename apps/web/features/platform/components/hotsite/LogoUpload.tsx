'use client';

import { useTranslations } from 'next-intl';
import { SingleImageUploadField } from './SingleImageUploadField';

interface LogoUploadProps {
  readonly value: string;
  readonly onChange: (logoUrl: string) => void;
}

const FIELD_ID = 'hotsite-logo';

// Thin wrapper: supplies the branding-specific purpose, small preview size, and translated
// labels to the shared SingleImageUploadField. Deliberately not unified into one UI component
// with PhotoUpload.tsx/AfterServicePhotoUpload.tsx: those are multi-file galleries
// (append + remove), this replaces a single value in place, and PhotoUpload additionally
// renders on the public hotsite tree using --ba-* branding tokens (a different styling system
// per the "Web styling boundary" rule — never mixed with the dashboard's Tailwind palette used
// here).
export function LogoUpload({ value, onChange }: LogoUploadProps): React.JSX.Element {
  const t = useTranslations('dashboard.hotsitePage.branding');

  return (
    <SingleImageUploadField
      id={FIELD_ID}
      value={value}
      onChange={onChange}
      purpose="branding"
      previewSize="small"
      label={t('logoLabel')}
      clickToAddLabel={t('logoClickToAdd')}
      formatHintLabel={t('logoFormatHint')}
      uploadingLabel={t('logoUploading')}
      uploadErrorLabel={t('logoUploadError')}
      removeLabel={t('logoRemove')}
    />
  );
}
