// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWithIntl } from '@/test-utils';
import { ServiceResourceModePicker } from './ServiceResourceModePicker';

describe('ServiceResourceModePicker', () => {
  it('reflects the active mode via aria-pressed', () => {
    renderWithIntl(
      <ServiceResourceModePicker mode="flat" legsLockedOnServer={false} onSelectMode={vi.fn()} />,
    );

    expect(screen.getByTestId('resource-mode-flat')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('resource-mode-legs')).toHaveAttribute('aria-pressed', 'false');
  });

  it('calls onSelectMode when a mode button is clicked', async () => {
    const user = userEvent.setup();
    const onSelectMode = vi.fn();
    renderWithIntl(
      <ServiceResourceModePicker
        mode="flat"
        legsLockedOnServer={false}
        onSelectMode={onSelectMode}
      />,
    );

    await user.click(screen.getByTestId('resource-mode-legs'));
    expect(onSelectMode).toHaveBeenCalledWith('legs');
  });

  it('disables and locks the flat option once the service is legged on the server', () => {
    renderWithIntl(
      <ServiceResourceModePicker mode="legs" legsLockedOnServer onSelectMode={vi.fn()} />,
    );

    expect(screen.getByTestId('resource-mode-flat')).toBeDisabled();
  });

  it('renders the mode buttons inside a card headed by the question, styled like its sibling cards', () => {
    renderWithIntl(
      <ServiceResourceModePicker mode="flat" legsLockedOnServer={false} onSelectMode={vi.fn()} />,
    );

    const heading = screen.getByRole('heading', { name: 'Como este serviço usa recursos?' });
    const card = heading.closest('.shadow-sm');
    expect(card).not.toBeNull();
    expect(card).toContainElement(screen.getByTestId('resource-mode-flat'));
    expect(card).toContainElement(screen.getByTestId('resource-mode-legs'));
    expect(heading).toHaveClass('text-sm', 'font-semibold');
  });
});
