'use client';

import { useId } from 'react';
import { Textarea } from '@/shared/components/ui/textarea';
import { useTranslations } from 'next-intl';
import { Card, CardContent } from '@/shared/components/ui/card';
import { Label } from '@/shared/components/ui/label';

interface RescheduleNotesCardProps {
  readonly value: string;
  readonly onChange: (value: string) => void;
}

// The admin notes of a reschedule, inside a card with its heading (TD57-S12: every control sits in a card).
export function RescheduleNotesCard({
  value,
  onChange,
}: RescheduleNotesCardProps): React.JSX.Element {
  const fieldId = useId();
  const t = useTranslations('dashboard.bookingDetail');

  return (
    <section>
      <Card>
        <CardContent className="p-4">
          <p className="mb-3 text-sm font-semibold text-gray-900">{t('notesSection')}</p>
          <div className="block">
            <Label htmlFor={fieldId}>{t('notesLabel')}</Label>
            <Textarea
              id={fieldId}
              value={value}
              onChange={(event) => onChange(event.target.value)}
              rows={4}
              maxLength={500}
              placeholder={t('rescheduleNotesPlaceholder')}
            />
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
