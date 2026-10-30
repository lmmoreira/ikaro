// @vitest-environment jsdom
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

  it('hides the primary save/activate action when showPrimaryAction is false', () => {
    renderWithIntl(
      <ServiceEditActionPanels
        isActive
        isSubmitting={false}
        isActivating={false}
        onActivate={vi.fn()}
        showPrimaryAction={false}
      />,
    );

    expect(screen.queryByTestId('service-desktop-save-button')).not.toBeInTheDocument();
    expect(screen.queryByTestId('service-mobile-save-button')).not.toBeInTheDocument();
    expect(screen.getByTestId('service-cancel-desktop-link')).toBeInTheDocument();
  });

  it('calls onCancelClick when the cancel link is clicked', () => {
    const onCancelClick = vi.fn();
    renderWithIntl(
      <ServiceEditActionPanels
        isActive
        isSubmitting={false}
        isActivating={false}
        onActivate={vi.fn()}
        onCancelClick={onCancelClick}
      />,
    );

    screen.getByTestId('service-cancel-desktop-link').click();
    expect(onCancelClick).toHaveBeenCalledTimes(1);
  });

  it('renders the active tab action in the desktop aside and mobile bar, without the Detalhes action', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    renderWithIntl(
      <ServiceEditActionPanels
        isActive
        isSubmitting={false}
        isActivating={false}
        onActivate={vi.fn()}
        showPrimaryAction={false}
        tabAction={{
          label: 'Salvar recursos',
          disabled: false,
          pending: false,
          onSubmit,
          feedback: null,
        }}
      />,
    );

    expect(screen.queryByTestId('service-desktop-save-button')).not.toBeInTheDocument();
    expect(screen.getByTestId('service-desktop-tab-action')).toHaveTextContent('Salvar recursos');
    expect(screen.getByTestId('service-mobile-tab-action')).toHaveTextContent('Salvar recursos');

    await user.click(screen.getByTestId('service-desktop-tab-action'));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('disables the tab action when the panel reports it disabled or pending, and shows loading while pending', () => {
    const { rerender } = renderWithIntl(
      <ServiceEditActionPanels
        isActive
        isSubmitting={false}
        isActivating={false}
        onActivate={vi.fn()}
        showPrimaryAction={false}
        tabAction={{
          label: 'Publicar formulário',
          disabled: true,
          pending: false,
          onSubmit: vi.fn(),
          feedback: null,
        }}
      />,
    );
    expect(screen.getByTestId('service-desktop-tab-action')).toBeDisabled();

    rerender(
      <ServiceEditActionPanels
        isActive
        isSubmitting={false}
        isActivating={false}
        onActivate={vi.fn()}
        showPrimaryAction={false}
        tabAction={{
          label: 'Publicar formulário',
          disabled: false,
          pending: true,
          onSubmit: vi.fn(),
          feedback: null,
        }}
      />,
    );
    expect(screen.getByTestId('service-desktop-tab-action')).toBeDisabled();
    expect(screen.getByTestId('service-desktop-tab-action')).not.toHaveTextContent(
      'Publicar formulário',
    );
  });

  it('keeps the Cancelar link but renders no mobile bar when there is no action at all', () => {
    renderWithIntl(
      <ServiceEditActionPanels
        isActive
        isSubmitting={false}
        isActivating={false}
        onActivate={vi.fn()}
        showPrimaryAction={false}
        tabAction={null}
      />,
    );

    expect(screen.getByTestId('service-cancel-desktop-link')).toBeInTheDocument();
    expect(screen.queryByTestId('service-cancel-mobile-link')).not.toBeInTheDocument();
    expect(screen.queryByTestId('service-desktop-tab-action')).not.toBeInTheDocument();
  });
});

describe('ServiceEditActionPanels feedback', () => {
  const ERROR = {
    variant: 'error',
    title: 'Não foi possível salvar',
    body: 'Algo falhou.',
  } as const;

  it('renders the tab action feedback below the buttons in the aside', () => {
    renderWithIntl(
      <ServiceEditActionPanels
        isActive
        isSubmitting={false}
        isActivating={false}
        onActivate={vi.fn()}
        showPrimaryAction={false}
        tabAction={{
          label: 'Salvar políticas',
          disabled: false,
          pending: false,
          onSubmit: vi.fn(),
          feedback: ERROR,
        }}
      />,
    );

    const aside = screen.getByTestId('action-pane-desktop');
    const feedback = within(aside).getByTestId('form-feedback');
    const button = within(aside).getByTestId('service-desktop-tab-action');
    expect(feedback).toHaveTextContent('Algo falhou.');
    expect(
      button.compareDocumentPosition(feedback) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('renders the same feedback above the buttons in the mobile bar', () => {
    renderWithIntl(
      <ServiceEditActionPanels
        isActive
        isSubmitting={false}
        isActivating={false}
        onActivate={vi.fn()}
        showPrimaryAction={false}
        tabAction={{
          label: 'Salvar políticas',
          disabled: false,
          pending: false,
          onSubmit: vi.fn(),
          feedback: ERROR,
        }}
      />,
    );

    const bar = screen.getByTestId('action-pane-mobile');
    const feedback = within(bar).getByTestId('form-feedback-mobile');
    const button = within(bar).getByTestId('service-mobile-tab-action');
    expect(feedback).toHaveTextContent('Algo falhou.');
    expect(
      feedback.compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('shows Detalhes its own feedback, not a tab action one', () => {
    renderWithIntl(
      <ServiceEditActionPanels
        isActive
        isSubmitting={false}
        isActivating={false}
        onActivate={vi.fn()}
        feedback={{ variant: 'success', title: 'Alterações salvas' }}
      />,
    );

    expect(
      within(screen.getByTestId('action-pane-desktop')).getByTestId('form-feedback'),
    ).toHaveTextContent('Alterações salvas');
  });

  it('renders no feedback card when there is no message', () => {
    renderWithIntl(
      <ServiceEditActionPanels
        isActive
        isSubmitting={false}
        isActivating={false}
        onActivate={vi.fn()}
      />,
    );

    expect(screen.queryByTestId('form-feedback')).not.toBeInTheDocument();
    expect(screen.queryByTestId('form-feedback-mobile')).not.toBeInTheDocument();
  });
});
