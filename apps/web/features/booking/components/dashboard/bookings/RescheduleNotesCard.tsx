'use client';

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
            <textarea
              value={value}
              onChange={(event) => onChange(event.target.value)}
              rows={4}
              maxLength={500}
              className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm outline-none ring-0 placeholder:text-gray-400 focus:border-blue-500"
              placeholder={t('rescheduleNotesPlaceholder')}
            />
          </label>
        </CardContent>
      </Card>
    </section>
  );
}
