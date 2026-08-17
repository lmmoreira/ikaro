// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithIntl } from '@/test-utils';
import { ServiceEditActionPanels, ServiceEditStatusSection } from './ServiceEditPanels';

describe('ServiceEditStatusSection', () => {
  it('renders a deactivate link to the service when active', () => {
    renderWithIntl(<ServiceEditStatusSection isActive serviceId="svc-1" />);

    expect(screen.getByTestId('service-deactivate-link')).toHaveAttribute(
      'href',
      '/dashboard/services/svc-1/deactivate',
    );
  });

  it('renders no deactivate link when inactive', () => {
    renderWithIntl(<ServiceEditStatusSection isActive={false} serviceId="svc-1" />);

    expect(screen.queryByTestId('service-deactivate-link')).not.toBeInTheDocument();
  });
});

describe('ServiceEditActionPanels', () => {
  it('renders desktop and mobile save buttons when active and not submitting', () => {
    renderWithIntl(
      <ServiceEditActionPanels
        isActive
        isSubmitting={false}
        isActivating={false}
        onActivate={vi.fn()}
      />,
    );

    expect(screen.getByTestId('service-desktop-save-button')).toBeEnabled();
    expect(screen.getByTestId('service-mobile-save-button')).toBeEnabled();
    expect(screen.queryByTestId('service-desktop-activate-button')).not.toBeInTheDocument();
  });

  it('disables the save buttons while submitting', () => {
    renderWithIntl(
      <ServiceEditActionPanels isActive isSubmitting isActivating={false} onActivate={vi.fn()} />,
    );

    expect(screen.getByTestId('service-desktop-save-button')).toBeDisabled();
    expect(screen.getByTestId('service-mobile-save-button')).toBeDisabled();
  });

  it('renders activate buttons instead of save buttons when inactive', () => {
    renderWithIntl(
      <ServiceEditActionPanels
        isActive={false}
        isSubmitting={false}
        isActivating={false}
        onActivate={vi.fn()}
      />,
    );

    expect(screen.getByTestId('service-desktop-activate-button')).toBeEnabled();
    expect(screen.getByTestId('service-mobile-activate-button')).toBeEnabled();
    expect(screen.queryByTestId('service-desktop-save-button')).not.toBeInTheDocument();
  });

  it('disables activate buttons and calls onActivate when clicked', async () => {
    const onActivate = vi.fn();
    renderWithIntl(
      <ServiceEditActionPanels
        isActive={false}
        isSubmitting={false}
        isActivating={false}
        onActivate={onActivate}
      />,
    );

    screen.getByTestId('service-desktop-activate-button').click();
    expect(onActivate).toHaveBeenCalledTimes(1);
  });

  it('disables activate buttons while activating', () => {
    renderWithIntl(
      <ServiceEditActionPanels
        isActive={false}
        isSubmitting={false}
        isActivating
        onActivate={vi.fn()}
      />,
    );

    expect(screen.getByTestId('service-desktop-activate-button')).toBeDisabled();
    expect(screen.getByTestId('service-mobile-activate-button')).toBeDisabled();
  });

  it('renders cancel links to /dashboard/services for both desktop and mobile', () => {
    renderWithIntl(
      <ServiceEditActionPanels
        isActive
        isSubmitting={false}
        isActivating={false}
        onActivate={vi.fn()}
      />,
    );

    expect(screen.getByTestId('service-cancel-desktop-link')).toHaveAttribute(
      'href',
      '/dashboard/services',
    );
    expect(screen.getByTestId('service-cancel-mobile-link')).toHaveAttribute(
      'href',
      '/dashboard/services',
    );
  });
});
