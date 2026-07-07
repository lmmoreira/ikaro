// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { HotsiteModuleResponse } from '@ikaro/types';
import { renderWithIntl } from '@/test-utils';
import { LayoutTab, reorderLayout } from './LayoutTab';

const LAYOUT: HotsiteModuleResponse[] = [
  { type: 'HERO', enabled: true, data: {} },
  { type: 'SERVICE_LIST', enabled: false, data: {} },
  { type: 'GALLERY', enabled: true, data: {} },
];

describe('reorderLayout', () => {
  it('moves the active module to the position of the over module', () => {
    const result = reorderLayout(LAYOUT, 'GALLERY', 'HERO');

    expect(result.map((m) => m.type)).toEqual(['GALLERY', 'HERO', 'SERVICE_LIST']);
  });

  it('returns the same order when active and over are the same', () => {
    const result = reorderLayout(LAYOUT, 'HERO', 'HERO');

    expect(result.map((m) => m.type)).toEqual(['HERO', 'SERVICE_LIST', 'GALLERY']);
  });

  it('is a no-op if either type is not found', () => {
    const result = reorderLayout(LAYOUT, 'HERO', 'FOOTER');

    expect(result.map((m) => m.type)).toEqual(['HERO', 'SERVICE_LIST', 'GALLERY']);
  });
});

describe('LayoutTab', () => {
  it('renders all modules with their translated labels and current enabled state', () => {
    renderWithIntl(<LayoutTab layout={LAYOUT} onChange={vi.fn()} onConfigure={vi.fn()} />);

    expect(screen.getByTestId('layout-row-HERO')).toBeInTheDocument();
    expect(screen.getByTestId('layout-row-toggle-HERO')).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByTestId('layout-row-toggle-SERVICE_LIST')).toHaveAttribute(
      'aria-checked',
      'false',
    );
    expect(screen.getByText('Hero')).toBeInTheDocument();
    expect(screen.getByText('Lista de serviços')).toBeInTheDocument();
    expect(screen.getByText('Galeria')).toBeInTheDocument();
  });

  it('toggling a module calls onChange with only that module flipped', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    renderWithIntl(<LayoutTab layout={LAYOUT} onChange={onChange} onConfigure={vi.fn()} />);

    await user.click(screen.getByTestId('layout-row-toggle-SERVICE_LIST'));

    expect(onChange).toHaveBeenCalledWith([LAYOUT[0], { ...LAYOUT[1], enabled: true }, LAYOUT[2]]);
  });

  it('clicking "Configurar" calls onConfigure with that module\'s type', async () => {
    const user = userEvent.setup();
    const onConfigure = vi.fn();

    renderWithIntl(<LayoutTab layout={LAYOUT} onChange={vi.fn()} onConfigure={onConfigure} />);

    await user.click(screen.getByTestId('layout-row-configure-GALLERY'));

    expect(onConfigure).toHaveBeenCalledWith('GALLERY');
  });
});
