'use client';

import { useTranslations } from 'next-intl';
import type { ContentBlockModuleData } from '@ikaro/types';
import { ProcessStepsFields, TrustGridFields } from './ContentBlockListVariants';
import { CollageFields, TechnicalCalloutFields } from './ContentBlockMediaVariants';

interface VariantFieldsProps {
  readonly data: ContentBlockModuleData;
  readonly onChange: (data: ContentBlockModuleData) => void;
}

// The fields that belong to one variant only. The two statements have none: their imagery is the
// section's own background (Section appearance).
export function ContentBlockVariantFields({
  data,
  onChange,
}: VariantFieldsProps): React.JSX.Element {
  const t = useTranslations('dashboard.hotsitePage.layout.panels.contentBlock');
  switch (data.variant) {
    case 'trust-grid':
      return <TrustGridFields data={data} onChange={onChange} />;
    case 'process-steps':
      return <ProcessStepsFields data={data} onChange={onChange} />;
    case 'collage-callout':
      return <CollageFields data={data} onChange={onChange} />;
    case 'technical-callout':
      return <TechnicalCalloutFields data={data} onChange={onChange} />;
    case 'image-statement':
    case 'immersive-statement':
      return (
        <p className="text-sm text-gray-500" data-testid="content-block-statement-hint">
          {t('statementImageHint')}
        </p>
      );
  }
}
