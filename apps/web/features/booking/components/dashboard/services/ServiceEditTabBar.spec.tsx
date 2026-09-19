// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWithIntl } from '@/test-utils';
import { INITIAL_SERVICE_EDIT_DIRTY_STATE } from '@/features/booking/types/service';
import { ServiceEditTabBar } from './ServiceEditTabBar';

function getTab(container: HTMLElement, tab: string): HTMLElement {
  const el = container.querySelector(`[data-testid="service-edit-tab"][data-tab="${tab}"]`);
  if (!el) throw new Error(`No tab found for ${tab}`);
  return el as HTMLElement;
}

describe('ServiceEditTabBar', () => {
  it('renders all 4 tabs with role=tab and marks the active one selected', () => {
    const { container } = renderWithIntl(
      <ServiceEditTabBar
        activeTab="recursos"
        dirty={INITIAL_SERVICE_EDIT_DIRTY_STATE}
        onTabChange={vi.fn()}
      />,
    );

    expect(screen.getAllByRole('tab')).toHaveLength(4);
    expect(getTab(container, 'recursos')).toHaveAttribute('aria-selected', 'true');
    expect(getTab(container, 'detalhes')).toHaveAttribute('aria-selected', 'false');
  });

  it('calls onTabChange when a tab is clicked', async () => {
    const user = userEvent.setup();
    const onTabChange = vi.fn();
    const { container } = renderWithIntl(
      <ServiceEditTabBar
        activeTab="detalhes"
        dirty={INITIAL_SERVICE_EDIT_DIRTY_STATE}
        onTabChange={onTabChange}
      />,
    );

    await user.click(getTab(container, 'politicas'));
    expect(onTabChange).toHaveBeenCalledWith('politicas');
  });

  it('shows a dirty dot only for tabs marked dirty, including formulario', () => {
    const { container } = renderWithIntl(
      <ServiceEditTabBar
        activeTab="detalhes"
        dirty={{ detalhes: true, recursos: false, politicas: true, formulario: true }}
        onTabChange={vi.fn()}
      />,
    );

    expect(
      container.querySelector('[data-testid="service-edit-tab-dirty-dot"][data-tab="detalhes"]'),
    ).toBeInTheDocument();
    expect(
      container.querySelector('[data-testid="service-edit-tab-dirty-dot"][data-tab="recursos"]'),
    ).not.toBeInTheDocument();
    expect(
      container.querySelector('[data-testid="service-edit-tab-dirty-dot"][data-tab="politicas"]'),
    ).toBeInTheDocument();
    expect(
      container.querySelector('[data-testid="service-edit-tab-dirty-dot"][data-tab="formulario"]'),
    ).toBeInTheDocument();
  });
});
