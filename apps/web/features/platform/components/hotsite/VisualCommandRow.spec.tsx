// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { describe, expect, it, vi } from 'vitest';
import { renderWithIntl } from '@/test-utils';
import { VisualCommandRow } from './VisualCommandRow';

function renderRow(overrides: Partial<React.ComponentProps<typeof VisualCommandRow>> = {}) {
  const props = {
    activeContext: 'structure' as const,
    liveSiteHref: '/tenant-a',
    publishDisabled: false,
    publishBlocked: false,
    onShowContext: vi.fn(),
    onEditInDetail: vi.fn(),
    onPublish: vi.fn(),
    ...overrides,
  };
  return { ...renderWithIntl(<VisualCommandRow {...props} />), props };
}

describe('VisualCommandRow', () => {
  it('requests the clicked global context', async () => {
    const user = userEvent.setup();
    const { props } = renderRow();

    await user.click(screen.getByRole('button', { name: 'Branding e estilo' }));
    await user.click(screen.getByRole('button', { name: 'Compartilhamento' }));

    expect(props.onShowContext).toHaveBeenNthCalledWith(1, 'branding');
    expect(props.onShowContext).toHaveBeenNthCalledWith(2, 'sharing');
  });

  it('marks the active context as pressed and no context while a module is open', () => {
    const { rerender, props } = renderRow({ activeContext: 'sharing' });
    expect(screen.getByRole('button', { name: 'Compartilhamento' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Organizar módulos' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );

    rerender(<VisualCommandRow {...props} activeContext={null} />);

    expect(screen.queryAllByRole('button', { pressed: true })).toHaveLength(0);
  });

  it('explains a blocked Publish and ties the hint to the button', () => {
    renderRow({ publishDisabled: true, publishBlocked: true });

    const publish = screen.getByRole('button', { name: 'Publicar' });
    expect(publish).toBeDisabled();
    expect(publish).toHaveAccessibleDescription('Aplique ou cancele primeiro');
  });

  it('has no axe violations', async () => {
    const { container } = renderRow({ publishBlocked: true, publishDisabled: true });

    expect(await axe(container)).toHaveNoViolations();
  });
});
