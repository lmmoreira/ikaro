// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWithIntl } from '@/test-utils';
import { ModuleConfigShell } from './ModuleConfigShell';

describe('ModuleConfigShell', () => {
  it('renders the module label in the title and children in the content area', () => {
    renderWithIntl(
      <ModuleConfigShell moduleLabel="Hero" onBack={vi.fn()} onApply={vi.fn()}>
        <p data-testid="field">Título</p>
      </ModuleConfigShell>,
    );

    expect(screen.getByText('Configurar: Hero')).toBeInTheDocument();
    expect(screen.getByTestId('field')).toBeInTheDocument();
  });

  it('calls onBack when the back arrow is clicked', async () => {
    const user = userEvent.setup();
    const onBack = vi.fn();

    renderWithIntl(
      <ModuleConfigShell moduleLabel="Hero" onBack={onBack} onApply={vi.fn()}>
        <div />
      </ModuleConfigShell>,
    );

    await user.click(screen.getByTestId('module-config-back'));

    expect(onBack).toHaveBeenCalled();
  });

  it('calls onApply from both the desktop aside and the mobile action bar', async () => {
    const user = userEvent.setup();
    const onApply = vi.fn();

    renderWithIntl(
      <ModuleConfigShell moduleLabel="Hero" onBack={vi.fn()} onApply={onApply}>
        <div />
      </ModuleConfigShell>,
    );

    await user.click(screen.getByTestId('module-config-apply-desktop'));
    await user.click(screen.getByTestId('module-config-apply-mobile'));

    expect(onApply).toHaveBeenCalledTimes(2);
  });

  it('calls onBack from both the desktop and mobile cancel buttons', async () => {
    const user = userEvent.setup();
    const onBack = vi.fn();

    renderWithIntl(
      <ModuleConfigShell moduleLabel="Hero" onBack={onBack} onApply={vi.fn()}>
        <div />
      </ModuleConfigShell>,
    );

    await user.click(screen.getByTestId('module-config-cancel-desktop'));
    await user.click(screen.getByTestId('module-config-cancel-mobile'));

    expect(onBack).toHaveBeenCalledTimes(2);
  });
});
