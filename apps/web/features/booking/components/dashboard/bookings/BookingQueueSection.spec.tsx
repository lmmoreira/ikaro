// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BookingQueueSection } from './BookingQueueSection';

describe('BookingQueueSection', () => {
  it('renders the title', () => {
    render(
      <BookingQueueSection title="Pendentes" countLabel={null} hasItems emptyMessage="Vazio">
        <div>item</div>
      </BookingQueueSection>,
    );

    expect(screen.getByRole('heading', { name: 'Pendentes' })).toBeInTheDocument();
  });

  it('renders the count label when provided', () => {
    render(
      <BookingQueueSection title="Pendentes" countLabel="3" hasItems emptyMessage="Vazio">
        <div>item</div>
      </BookingQueueSection>,
    );

    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('renders no count label when null', () => {
    const { container } = render(
      <BookingQueueSection title="Pendentes" countLabel={null} hasItems emptyMessage="Vazio">
        <div>item</div>
      </BookingQueueSection>,
    );

    expect(container.querySelector('span')).not.toBeInTheDocument();
  });

  it('renders children when hasItems is true', () => {
    render(
      <BookingQueueSection title="Pendentes" countLabel={null} hasItems emptyMessage="Vazio">
        <div data-testid="queue-item">item</div>
      </BookingQueueSection>,
    );

    expect(screen.getByTestId('queue-item')).toBeInTheDocument();
    expect(screen.queryByText('Vazio')).not.toBeInTheDocument();
  });

  it('renders the empty message and not children when hasItems is false', () => {
    render(
      <BookingQueueSection
        title="Pendentes"
        countLabel={null}
        hasItems={false}
        emptyMessage="Nenhum agendamento"
      >
        <div data-testid="queue-item">item</div>
      </BookingQueueSection>,
    );

    expect(screen.getByText('Nenhum agendamento')).toBeInTheDocument();
    expect(screen.queryByTestId('queue-item')).not.toBeInTheDocument();
  });
});
