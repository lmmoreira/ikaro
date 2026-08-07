// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWithIntl } from '@/test-utils';
import { ModuleConfigShell } from './ModuleConfigShell';

function renderShell(overrides: Partial<Parameters<typeof ModuleConfigShell>[0]> = {}) {
  const props = {
    moduleLabel: 'Hero',
    onBack: vi.fn(),
    onApply: vi.fn(),
    onPreview: vi.fn(),
    discardConfirmOpen: false,
    onConfirmDiscard: vi.fn(),
    onCancelDiscard: vi.fn(),
    ...overrides,
  };
  renderWithIntl(
    <ModuleConfigShell {...props}>
      <div data-testid="field" />
    </ModuleConfigShell>,
  );
  return props;
}

describe('ModuleConfigShell', () => {
  it('renders the module label in the aside and children in the content area', () => {
    renderShell();

    expect(screen.getByText('Hero', { selector: 'strong' })).toBeInTheDocument();
    expect(screen.getByTestId('field')).toBeInTheDocument();
  });

  it('calls onApply from both the desktop aside and the mobile action bar', async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();
    renderShell({ onApply });

    await user.click(screen.getByTestId('module-config-apply-desktop'));
    await user.click(screen.getByTestId('module-config-apply-mobile'));

    expect(onApply).toHaveBeenCalledTimes(2);
  });

  it('calls onBack from both the desktop and mobile cancel buttons', async () => {
    const user = userEvent.setup();
    const onBack = vi.fn();
    renderShell({ onBack });

    await user.click(screen.getByTestId('module-config-cancel-desktop'));
    await user.click(screen.getByTestId('module-config-cancel-mobile'));

    expect(onBack).toHaveBeenCalledTimes(2);
  });

  it('calls onPreview from both the desktop and mobile preview buttons, without calling onApply/onBack', async () => {
    const user = userEvent.setup();
    const onPreview = vi.fn();
    const onApply = vi.fn();
    const onBack = vi.fn();
    renderShell({ onPreview, onApply, onBack });

    await user.click(screen.getByTestId('module-config-preview-desktop'));
    await user.click(screen.getByTestId('module-config-preview-mobile'));

    expect(onPreview).toHaveBeenCalledTimes(2);
    expect(onApply).not.toHaveBeenCalled();
    expect(onBack).not.toHaveBeenCalled();
  });

  it('does not render the discard-confirm dialog when discardConfirmOpen is false', () => {
    renderShell({ discardConfirmOpen: false });

    expect(screen.queryByTestId('module-config-discard-confirm')).not.toBeInTheDocument();
  });

  it('renders the discard-confirm dialog when discardConfirmOpen is true', () => {
    renderShell({ discardConfirmOpen: true });

    expect(screen.getByTestId('module-config-discard-confirm')).toBeInTheDocument();
  });

  it('calls onConfirmDiscard when the discard button is clicked', async () => {
    const user = userEvent.setup();
    const onConfirmDiscard = vi.fn();
    renderShell({ discardConfirmOpen: true, onConfirmDiscard });

    await user.click(screen.getByTestId('module-config-discard-confirm'));

    expect(onConfirmDiscard).toHaveBeenCalledTimes(1);
  });

  it('calls onCancelDiscard when "keep editing" is clicked', async () => {
    const user = userEvent.setup();
    const onCancelDiscard = vi.fn();
    renderShell({ discardConfirmOpen: true, onCancelDiscard });

    await user.click(screen.getByRole('button', { name: 'Continuar editando' }));

    expect(onCancelDiscard).toHaveBeenCalledTimes(1);
  });
});
