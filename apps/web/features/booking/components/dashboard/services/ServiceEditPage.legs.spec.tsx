// @vitest-environment jsdom
import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ServiceIntakeSchemaResponse } from '@ikaro/types';
import { makeStaffService } from '@/features/booking/services/staff-service.fixture';
import { renderWithIntl } from '@/test-utils';
import { ServiceEditPage } from './ServiceEditPage';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

vi.mock('@/features/booking/services/useServices', () => ({
  useUpdateService: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useActivateService: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock('@/shells/dashboard/components/topbar-status-context', () => ({
  useDashboardTopbarStatus: () => null,
}));

// The config tabs are stubbed so the test can trigger what the real Recursos tab does after it
// saves legs: report the legs' span through `onLegsSaved`.
vi.mock('./ServiceEditConfigTabPanels', () => ({
  ServiceEditConfigTabPanels: (props: {
    readonly hasLegs: boolean;
    readonly onLegsSaved?: (totalSpanMinutes: number) => void;
  }) => (
    <div data-testid="config-tabs-stub" data-has-legs={String(props.hasLegs)}>
      <button type="button" onClick={() => props.onLegsSaved?.(135)}>
        simulate legs saved
      </button>
    </div>
  ),
}));

const INTAKE_SCHEMA: ServiceIntakeSchemaResponse = { active: null, history: [] };

function renderPage() {
  return renderWithIntl(
    <ServiceEditPage service={makeStaffService()} intakeSchema={INTAKE_SCHEMA} />,
  );
}

// What ties the two halves of a legs save together on the page: the session learns the service
// now has legs, and the Detalhes form takes the legs' span as its duration.
describe('ServiceEditPage — when the Recursos tab reports saved legs', () => {
  it('starts with an editable duration and tells the config tabs the service has no legs', () => {
    renderPage();

    expect(screen.getByLabelText('Duração')).toHaveDisplayValue('60');
    expect(screen.getByLabelText('Duração')).not.toHaveAttribute('readonly');
    expect(screen.getByTestId('config-tabs-stub')).toHaveAttribute('data-has-legs', 'false');
  });

  it('shows the legs span as a locked duration and marks the service as having legs', async () => {
    renderPage();

    await act(async () => userEvent.click(screen.getByText('simulate legs saved')));

    expect(screen.getByLabelText('Duração')).toHaveDisplayValue('135');
    expect(screen.getByLabelText('Duração')).toHaveAttribute('readonly');
    expect(screen.getByTestId('config-tabs-stub')).toHaveAttribute('data-has-legs', 'true');
  });

  it('does not count the legs save as an unsaved edit of the Detalhes tab', async () => {
    const { container } = renderPage();

    await act(async () => userEvent.click(screen.getByText('simulate legs saved')));

    expect(
      container.querySelector('[data-testid="service-edit-tab-dirty-dot"][data-tab="detalhes"]'),
    ).toBeNull();
  });
});
