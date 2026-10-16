// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BookingTextCard } from './BookingTextCard';

describe('BookingTextCard', () => {
  it.each([null, '', '   '])('renders nothing for an absent or blank text (%j)', (text) => {
    render(<BookingTextCard title="Notas internas" text={text} testId="internal-notes" />);

    expect(screen.queryByTestId('internal-notes')).not.toBeInTheDocument();
  });

  it('renders the title, the text and the note', () => {
    render(
      <BookingTextCard
        title="Notas internas"
        text="Cliente pediu a vaga coberta."
        testId="internal-notes"
        note="Somente a equipe vê."
      />,
    );

    expect(screen.getByText('Notas internas')).toBeInTheDocument();
    expect(screen.getByText('Cliente pediu a vaga coberta.')).toBeInTheDocument();
    expect(screen.getByText('Somente a equipe vê.')).toBeInTheDocument();
  });
});
