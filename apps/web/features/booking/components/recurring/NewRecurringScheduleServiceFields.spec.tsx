// @vitest-environment jsdom
import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { makeHotsiteService, renderWithIntl } from '@/test-utils';
import { AutoResourceLine, ResourceField, ServiceField } from './NewRecurringScheduleServiceFields';

const SERVICE = makeHotsiteService({
  name: 'Sala Aurora',
  durationMinutes: 120,
  price: { amount: 100, currency: 'BRL', formatted: 'R$ 100,00' },
});

type Query = React.ComponentProps<typeof ResourceField>['query'];

function query(overrides: Record<string, unknown>): Query {
  return { isError: false, isPending: false, ...overrides } as unknown as Query;
}

describe('ServiceField', () => {
  it('shows the selected service with its duration and price', () => {
    renderWithIntl(<ServiceField services={[SERVICE]} serviceId={SERVICE.id} onChange={vi.fn()} />);

    expect(screen.getByTestId('new-schedule-service')).toHaveTextContent(
      'Sala Aurora — 2h · R$ 100,00',
    );
    expect(
      screen.getByText('Só aparecem serviços que permitem reserva recorrente.'),
    ).toBeInTheDocument();
  });
});

describe('ResourceField', () => {
  const options = [
    { resourceId: 'room-a', name: 'Sala Aurora' },
    { resourceId: 'room-b', name: 'Sala Horizonte' },
  ];
  const base = {
    title: 'Sala',
    options,
    requiredMessage: 'Escolha a sala',
    noOptionsMessage: 'Nenhuma sala está disponível para este serviço no momento.',
  };

  it('offers one pill per resource under its title and reports the pick', () => {
    const onChange = vi.fn();
    renderWithIntl(
      <ResourceField
        {...base}
        query={query({})}
        resourceId="room-a"
        required={false}
        onChange={onChange}
      />,
    );

    expect(screen.getByRole('radiogroup', { name: 'Sala' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Sala Aurora' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    fireEvent.click(screen.getByRole('radio', { name: 'Sala Horizonte' }));
    expect(onChange).toHaveBeenCalledWith('room-b');
  });

  it('says it is loading, then that it failed', () => {
    const { unmount } = renderWithIntl(
      <ResourceField
        {...base}
        query={query({ isPending: true })}
        resourceId={null}
        required={false}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByText('Carregando recursos…')).toBeInTheDocument();
    unmount();

    renderWithIntl(
      <ResourceField
        {...base}
        query={query({ isError: true })}
        resourceId={null}
        required={false}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Não foi possível carregar os recursos');
  });

  it('says so when the requirement has no options', () => {
    renderWithIntl(
      <ResourceField
        {...base}
        options={[]}
        query={query({})}
        resourceId={null}
        required={false}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByTestId('new-schedule-resource-empty')).toHaveTextContent(
      'Nenhuma sala está disponível para este serviço no momento.',
    );
    expect(screen.queryByRole('radio')).not.toBeInTheDocument();
  });

  it('shows the missing-pick message it was given when required', () => {
    renderWithIntl(
      <ResourceField {...base} query={query({})} resourceId={null} required onChange={vi.fn()} />,
    );
    expect(screen.getByText('Escolha a sala')).toBeInTheDocument();
  });

  it('numbers each group of a bundle in a data attribute', () => {
    renderWithIntl(
      <ResourceField
        {...base}
        query={query({})}
        resourceId={null}
        required={false}
        index={1}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByTestId('new-schedule-resource')).toHaveAttribute('data-index', '1');
  });
});

describe('AutoResourceLine', () => {
  it('is a read-only line under its title', () => {
    renderWithIntl(
      <AutoResourceLine title="Sala" text="Escolhida automaticamente a cada semana" />,
    );
    expect(screen.getByTestId('new-schedule-resource-auto')).toHaveTextContent('Sala');
    expect(screen.getByTestId('new-schedule-resource-auto')).toHaveTextContent(
      'Escolhida automaticamente a cada semana',
    );
    expect(screen.queryByRole('radio')).not.toBeInTheDocument();
  });
});
