// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ScheduleRemovalSummary } from './ScheduleRemovalSummary';

describe('ScheduleRemovalSummary', () => {
  it('renders the closure summary block', () => {
    render(
      <ScheduleRemovalSummary
        title="Folga da equipe"
        dateLabel="Quinta-feira, 2 de julho"
        rangeLabel="00:00–05:00"
        notesLabel="Observações"
        notes="Texto livre"
      />,
    );

    expect(screen.getByText('Folga da equipe')).toBeInTheDocument();
    expect(screen.getByText('Quinta-feira, 2 de julho')).toBeInTheDocument();
    expect(screen.getByText('00:00–05:00')).toBeInTheDocument();
    expect(screen.getByText('Texto livre')).toBeInTheDocument();
  });

  it('renders the opening summary without a title', () => {
    render(
      <ScheduleRemovalSummary
        dateLabel="Quinta-feira, 2 de julho"
        rangeLabel="08:00–12:00"
        notesLabel="Observações"
      />,
    );

    expect(screen.getByText('Quinta-feira, 2 de julho')).toBeInTheDocument();
    expect(screen.getByText('08:00–12:00')).toBeInTheDocument();
  });
});
