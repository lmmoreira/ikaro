import { BookingDetailSection } from './BookingDetailSection';

interface BookingTextCardProps {
  readonly title: string;
  readonly text: string | null;
  readonly testId: string;
  readonly note?: string;
}

// A free-text field of the booking (the customer's notes, the internal notes): its own card with
// the text as written. Renders nothing for an absent or blank text.
export function BookingTextCard({
  title,
  text,
  testId,
  note,
}: BookingTextCardProps): React.JSX.Element | null {
  if (text === null || text.trim() === '') return null;

  return (
    <BookingDetailSection title={title} testId={testId} note={note}>
      <p className="whitespace-pre-line py-2.5 text-sm leading-6 text-gray-900">{text}</p>
    </BookingDetailSection>
  );
}
