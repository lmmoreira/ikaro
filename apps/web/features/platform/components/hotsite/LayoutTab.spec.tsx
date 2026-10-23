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

  describe('NAVIGATION is pinned first', () => {
    const WITH_NAVIGATION: HotsiteModuleResponse[] = [
      { type: 'NAVIGATION', enabled: true, data: { items: [] } },
      ...LAYOUT,
    ];
    const order = (layout: HotsiteModuleResponse[]): string[] => layout.map((m) => m.type);

    it('refuses to drag NAVIGATION anywhere', () => {
      expect(order(reorderLayout(WITH_NAVIGATION, 'NAVIGATION', 'GALLERY'))).toEqual(
        order(WITH_NAVIGATION),
      );
    });

    it('refuses to drop another module on NAVIGATION, which would place it above', () => {
      expect(order(reorderLayout(WITH_NAVIGATION, 'GALLERY', 'NAVIGATION'))).toEqual(
        order(WITH_NAVIGATION),
      );
    });

    it('still reorders the other modules below it', () => {
      expect(order(reorderLayout(WITH_NAVIGATION, 'GALLERY', 'HERO'))).toEqual([
        'NAVIGATION',
        'GALLERY',
        'HERO',
        'SERVICE_LIST',
      ]);
    });
  });

  it('is a no-op if either type is not found', () => {
    const result = reorderLayout(LAYOUT, 'HERO', 'FOOTER');

    expect(result.map((m) => m.type)).toEqual(['HERO', 'SERVICE_LIST', 'GALLERY']);
  });
});

describe('LayoutTab', () => {
  it('renders all modules with their translated labels and current enabled state', () => {
    renderWithIntl(<LayoutTab layout={LAYOUT} onChange={vi.fn()} onConfigure={vi.fn()} />);

    expect(
      screen.getAllByTestId('layout-row').find((el) => el.dataset.moduleType === 'HERO'),
    ).toBeInTheDocument();
    expect(screen.getByTestId('layout-row-toggle-HERO')).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByTestId('layout-row-toggle-SERVICE_LIST')).toHaveAttribute(
      'aria-checked',
      'false',
    );
    expect(screen.getByText('Hero')).toBeInTheDocument();
    expect(screen.getByText('Lista de serviços')).toBeInTheDocument();
    expect(screen.getByText('Galeria')).toBeInTheDocument();
  });

  it('gives each drag handle a module-specific, localized aria-label (not a bare "drag")', () => {
    renderWithIntl(<LayoutTab layout={LAYOUT} onChange={vi.fn()} onConfigure={vi.fn()} />);

    const heroHandle = screen
      .getAllByTestId('layout-row-drag')
      .find((el) => el.dataset.moduleType === 'HERO')!;

    expect(heroHandle).toHaveAttribute('aria-label', 'Arrastar para reordenar: Hero');
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

    const configureButton = screen
      .getAllByTestId('layout-row-configure')
      .find((el) => el.dataset.moduleType === 'GALLERY')!;
    await user.click(configureButton);

    expect(onConfigure).toHaveBeenCalledWith('GALLERY');
  });
});

describe('LayoutTab — pinned NAVIGATION row', () => {
  it('renders no drag handle for NAVIGATION while every other row keeps one', () => {
    const layout: HotsiteModuleResponse[] = [
      { type: 'NAVIGATION', enabled: true, data: { items: [] } },
      { type: 'HERO', enabled: true, data: {} },
    ];

    renderWithIntl(<LayoutTab layout={layout} onChange={vi.fn()} onConfigure={vi.fn()} />);

    const handles = screen.getAllByTestId('layout-row-drag');
    expect(handles).toHaveLength(1);
    expect(handles[0]).toHaveAttribute('data-module-type', 'HERO');
    expect(screen.getByTestId('layout-row-pinned')).toBeInTheDocument();
  });

  it('labels the NAVIGATION and CONTENT_BLOCK rows in the active locale', () => {
    const layout: HotsiteModuleResponse[] = [
      { type: 'NAVIGATION', enabled: true, data: { items: [] } },
      { type: 'CONTENT_BLOCK', enabled: false, data: { variant: 'image-statement', title: 'T' } },
    ];

    renderWithIntl(<LayoutTab layout={layout} onChange={vi.fn()} onConfigure={vi.fn()} />);

    expect(screen.getByText('Navegação')).toBeInTheDocument();
    expect(screen.getByText('Bloco de conteúdo')).toBeInTheDocument();
  });
});
