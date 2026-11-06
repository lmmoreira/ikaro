'use client';

import { Textarea } from '@/shared/components/ui/textarea';
import { useTranslations } from 'next-intl';
import { Card, CardContent } from '@/shared/components/ui/card';

interface RescheduleNotesCardProps {
  readonly value: string;
  readonly onChange: (value: string) => void;
}

// The admin notes of a reschedule, inside a card with its heading (TD57-S12: every control sits in a card).
export function RescheduleNotesCard({
  value,
  onChange,
}: RescheduleNotesCardProps): React.JSX.Element {
  const t = useTranslations('dashboard.bookingDetail');

  return (
    <section>
      <Card>
        <CardContent className="p-4">
          <p className="mb-3 text-sm font-semibold text-gray-900">{t('notesSection')}</p>
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-gray-700">{t('notesLabel')}</span>
            <Textarea
              value={value}
              onChange={(event) => onChange(event.target.value)}
              rows={4}
              maxLength={500}
              placeholder={t('rescheduleNotesPlaceholder')}
            />
          </label>
        </CardContent>
      </Card>
    </section>
  );
}
