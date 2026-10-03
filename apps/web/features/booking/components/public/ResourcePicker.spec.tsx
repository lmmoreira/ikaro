// @vitest-environment jsdom
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { HotsiteServiceResourceOptionsRequirement } from '@ikaro/types';
import { renderWithIntl } from '@/test-utils';
import { ResourcePicker } from './ResourcePicker';

function requirement(
  resourceType: HotsiteServiceResourceOptionsRequirement['resourceType'],
  names: string[],
  legIndex: number | null = null,
): HotsiteServiceResourceOptionsRequirement {
  return {
    serviceId: 's1',
    legIndex,
    resourceType,
    selectionMode: 'CUSTOMER_CHOICE',
    requiredQuantity: 1,
    options: names.map((name, i) => ({ resourceId: `${resourceType}-${i}`, name })),
  };
}

const staff = requirement('STAFF', ['Camila Duarte', 'Bruno Alves']);
const room = requirement('ROOM', ['Sala Aurora', 'Sala Horizonte']);
const equipment = requirement('EQUIPMENT', ['Poltrona 1', 'Poltrona 2']);

function renderPicker(overrides: Partial<React.ComponentProps<typeof ResourcePicker>> = {}) {
  const props = {
    heading: 'Escolha o profissional',
    status: 'ready' as const,
    requirements: [staff],
    picks: [],
    onPick: vi.fn(),
    onRetry: vi.fn(),
    reselectMessage: null,
    ...overrides,
  };
  renderWithIntl(<ResourcePicker {...props} />);
  return props;
}

describe('ResourcePicker', () => {
  it('renders the heading, one section per requirement and the names only', () => {
    renderPicker({ requirements: [staff, room, equipment], heading: 'Faça suas escolhas' });

    expect(screen.getByRole('heading', { name: 'Faça suas escolhas' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Profissional' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Sala' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Equipamento' })).toBeInTheDocument();
    expect(screen.getAllByRole('radio')).toHaveLength(6);
    expect(screen.getByText('Sala Horizonte')).toBeInTheDocument();
  });

  it('renders a room-only picker with its own heading and no staff section', () => {
    renderPicker({ heading: 'Escolha a sala', requirements: [room] });

    expect(screen.getByRole('group', { name: 'Sala' })).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Profissional' })).not.toBeInTheDocument();
  });

  it('pre-selects nothing and shows the single-section hint', () => {
    renderPicker();

    screen.getAllByRole('radio').forEach((radio) => expect(radio).not.toBeChecked());
    expect(screen.getByTestId('picker-hint')).toHaveTextContent(
      'Escolha um profissional para continuar.',
    );
  });

  it('shows the multi-section hint until every section has a pick', () => {
    renderPicker({
      requirements: [staff, room],
      picks: [{ serviceId: 's1', legIndex: null, resourceType: 'STAFF', resourceId: 'STAFF-0' }],
    });

    expect(screen.getByTestId('picker-hint')).toHaveTextContent(
      'Escolha uma opção em cada seção para continuar.',
    );
  });

  it('marks the picked option checked and hides the hint once everything is picked', () => {
    renderPicker({
      picks: [{ serviceId: 's1', legIndex: null, resourceType: 'STAFF', resourceId: 'STAFF-1' }],
    });

    expect(screen.getByRole('radio', { name: 'Bruno Alves' })).toBeChecked();
    expect(screen.queryByTestId('picker-hint')).not.toBeInTheDocument();
  });

  it('reports the requirement and resource id of a pick', async () => {
    const user = userEvent.setup();
    const { onPick } = renderPicker({ requirements: [staff, room] });

    await user.click(within(screen.getByRole('group', { name: 'Sala' })).getByText('Sala Aurora'));

    expect(onPick).toHaveBeenCalledWith(room, 'ROOM-0');
  });

  it('keeps one pick per leg for the same resource type', () => {
    const leg1 = requirement('STAFF', ['Ana'], 1);
    renderPicker({
      requirements: [leg1],
      picks: [{ serviceId: 's1', legIndex: 2, resourceType: 'STAFF', resourceId: 'STAFF-0' }],
    });

    expect(screen.getByRole('radio')).not.toBeChecked();
  });

  it('shows the loading state instead of the sections', () => {
    renderPicker({ status: 'loading' });

    expect(screen.getByTestId('picker-loading')).toBeInTheDocument();
    expect(screen.queryAllByRole('radio')).toHaveLength(0);
  });

  it('shows the fetch error with a retry', async () => {
    const user = userEvent.setup();
    const { onRetry } = renderPicker({ status: 'error' });

    expect(screen.getByTestId('picker-load-error')).toHaveTextContent(
      'Não foi possível carregar as opções.',
    );
    await user.click(screen.getByRole('button', { name: 'Tentar novamente' }));

    expect(onRetry).toHaveBeenCalled();
  });

  it('shows the re-pick message with its hint and focuses the alert', () => {
    renderPicker({ reselectMessage: 'É necessário escolher um recurso para este serviço.' });

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('É necessário escolher um recurso para este serviço.');
    expect(alert).toHaveTextContent(
      'Escolha novamente. Seus serviços e as demais escolhas foram mantidos.',
    );
    expect(alert).toHaveFocus();
  });

  it('renders the subtitle and summary line when given', () => {
    renderPicker({
      subtitle: 'Jornada · Etapa 2 de 3 da jornada',
      summaryLine: 'Corte — R$ 90,00 — 50 min',
    });

    expect(screen.getByText('Jornada · Etapa 2 de 3 da jornada')).toBeInTheDocument();
    expect(screen.getByText('Corte — R$ 90,00 — 50 min')).toBeInTheDocument();
  });
});
