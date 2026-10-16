import { Card, CardContent } from '@/shared/components/ui/card';

interface BookingDetailSectionProps {
  readonly title: string;
  readonly testId: string;
  // A small explanatory line under the card.
  readonly note?: string;
  readonly children: React.ReactNode;
}

// The shared frame of every read-only card of the booking detail (staff and customer): an
// uppercase label, a card whose rows are separated by a divider, and an optional note.
export function BookingDetailSection({
  title,
  testId,
  note,
  children,
}: BookingDetailSectionProps): React.JSX.Element {
  return (
    <section data-testid={testId}>
      <p className="mb-2 text-xs font-bold uppercase tracking-[0.07em] text-gray-400">{title}</p>
      <Card>
        <CardContent className="divide-y divide-gray-100 px-4 py-0">{children}</CardContent>
      </Card>
      {note && <p className="mt-1.5 text-xs leading-5 text-gray-500">{note}</p>}
    </section>
  );
}

interface BookingDetailRowProps {
  readonly label: string;
  readonly children: React.ReactNode;
  // A second, quieter line under the value.
  readonly hint?: string;
}

export function BookingDetailRow({
  label,
  children,
  hint,
}: BookingDetailRowProps): React.JSX.Element {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5">
      <span className="text-sm text-gray-500">{label}</span>
      <span className="min-w-0 text-right text-sm font-semibold text-gray-900">
        {children}
        {hint && <span className="mt-0.5 block text-xs font-normal text-gray-500">{hint}</span>}
      </span>
    </div>
  );
}
