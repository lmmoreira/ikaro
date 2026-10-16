// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithIntl } from '@/test-utils';
import { BookingParticipantsCard } from './BookingParticipantsCard';

describe('BookingParticipantsCard', () => {
  it('renders nothing when there is no participant data', () => {
    renderWithIntl(<BookingParticipantsCard participantCount={null} attendees={[]} />);

    expect(screen.queryByTestId('booking-participants-card')).not.toBeInTheDocument();
  });

  it('shows only the count when the service does not ask for names', () => {
    renderWithIntl(<BookingParticipantsCard participantCount={3} attendees={[]} />);

    expect(screen.getByText('Participantes', { selector: 'span' })).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('lists each named participant and marks the minors', () => {
    renderWithIntl(
      <BookingParticipantsCard
        participantCount={2}
        attendees={[
          { name: 'Maria Souza', isMinor: false },
          { name: 'Pedro Souza', isMinor: true },
        ]}
      />,
    );

    expect(screen.getByText('Maria Souza')).toBeInTheDocument();
    expect(screen.getByText('Pedro Souza')).toBeInTheDocument();
    expect(screen.getAllByText('menor')).toHaveLength(1);
  });
});
