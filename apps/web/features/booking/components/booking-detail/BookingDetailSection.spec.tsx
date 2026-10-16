// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BookingDetailRow, BookingDetailSection } from './BookingDetailSection';

describe('BookingDetailSection', () => {
  it('renders the title, its rows and the note', () => {
    render(
      <BookingDetailSection title="Origem" testId="origin" note="Uma nota">
        <BookingDetailRow label="Solicitado em" hint="às 09:12">
          14/06/2026
        </BookingDetailRow>
      </BookingDetailSection>,
    );

    expect(screen.getByTestId('origin')).toBeInTheDocument();
    expect(screen.getByText('Origem')).toBeInTheDocument();
    expect(screen.getByText('Solicitado em')).toBeInTheDocument();
    expect(screen.getByText('14/06/2026')).toBeInTheDocument();
    expect(screen.getByText('às 09:12')).toBeInTheDocument();
    expect(screen.getByText('Uma nota')).toBeInTheDocument();
  });

  it('renders neither a note nor a hint when none is given', () => {
    render(
      <BookingDetailSection title="Origem" testId="origin">
        <BookingDetailRow label="Solicitado em">14/06/2026</BookingDetailRow>
      </BookingDetailSection>,
    );

    expect(screen.queryByText('Uma nota')).not.toBeInTheDocument();
    expect(screen.queryByText('às 09:12')).not.toBeInTheDocument();
  });
});
