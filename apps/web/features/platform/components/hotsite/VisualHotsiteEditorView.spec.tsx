// @vitest-environment jsdom
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { describe, expect, it, vi } from 'vitest';
import type { HotsiteAdminContentResponse } from '@ikaro/types';
import { renderWithIntl } from '@/test-utils';
import { VisualHotsiteEditorView } from './VisualHotsiteEditorView';
import type { VisualContext } from './hotsite-editor-views';

// The real canvas is covered by HotsitePreviewCanvas.spec.tsx; here it only needs to prove the
// view hands it the draft and a selection that reports back.
vi.mock('./hotsite-editor-lazy-panels', () => ({
  HotsitePreviewCanvas: ({
    selection,
  }: {
    selection?: {
      selectedType: string | null;
      onSelect: (type: 'CONTACT') => void;
    };
  }) => (
    <div data-testid="mock-canvas" data-selected={selection?.selectedType ?? ''}>
      <button
        type="button"
        data-testid="mock-select-contact"
        onClick={() => selection?.onSelect('CONTACT')}
      >
        select contact
      </button>
    </div>
  ),
}));

const DRAFT: HotsiteAdminContentResponse = {
  branding: {
    primaryColor: '#2563eb',
    secondaryColor: '#eff6ff',
    backgroundColor: '#ffffff',
    textColor: '#111827',
    headingFontFamily: 'Inter',
    bodyFontFamily: 'Inter',
    logoUrl: '',
    borderRadius: 'rounded',
    buttonStyle: 'filled',
    spacing: 'comfortable',
    shadowStyle: 'subtle',
  },
  layout: [],
  seo: { title: null, description: null, ogImageUrl: '' },
  isPublished: false,
  updatedAt: '2026-07-01T00:00:00.000Z',
};

const DRAFT_WITH_CONTACT: HotsiteAdminContentResponse = {
  ...DRAFT,
  layout: [{ type: 'CONTACT', enabled: true, data: {} }],
};

function renderView(overrides: Partial<React.ComponentProps<typeof VisualHotsiteEditorView>> = {}) {
  const props = {
    draft: DRAFT,
    visualContext: { kind: 'structure' } as VisualContext,
    actionBanner: null,
    tenantSlug: 'tenant-a',
    isPublishing: false,
    onSelectModule: vi.fn(),
    onEditInDetail: vi.fn(),
    onPublish: vi.fn(),
    ...overrides,
  };
  return { ...renderWithIntl(<VisualHotsiteEditorView {...props} />), props };
}

function command(name: string): HTMLElement {
  const match = screen
    .getAllByTestId('visual-command')
    .find((element) => element.dataset.command === name);
  if (!match) throw new Error(`No command ${name}`);
  return match;
}

describe('VisualHotsiteEditorView', () => {
  it('offers the six editor commands in a labelled group, none of them a tab', () => {
    renderView();

    const group = screen.getByRole('group', { name: 'Ações do editor' });
    expect(
      within(group)
        .getAllByTestId('visual-command')
        .map((el) => el.dataset.command),
    ).toEqual(['branding', 'structure', 'sharing', 'detail', 'view-live', 'publish']);
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
    expect(command('branding')).toHaveTextContent('Branding e estilo');
    expect(command('structure')).toHaveTextContent('Organizar módulos');
    expect(command('sharing')).toHaveTextContent('Compartilhamento');
    expect(command('detail')).toHaveTextContent('Editar em detalhes');
    expect(command('view-live')).toHaveTextContent('Ver site publicado');
    expect(command('publish')).toHaveTextContent('Publicar');
  });

  it.each(['branding', 'structure', 'sharing'])(
    'disables the %s command until its story lands, with a coming-soon hint',
    (name) => {
      renderView();

      expect(command(name)).toBeDisabled();
      expect(command(name)).toHaveAttribute(
        'title',
        'Disponível em breve — use Editar em detalhes',
      );
      expect(command(name)).toHaveAccessibleDescription(
        'Disponível em breve — use Editar em detalhes',
      );
    },
  );

  it('calls onEditInDetail from the Edit in detail command', async () => {
    const user = userEvent.setup();
    const { props } = renderView();

    await user.click(command('detail'));

    expect(props.onEditInDetail).toHaveBeenCalledTimes(1);
  });

  it('publishes from the desktop command and from the mobile bar', async () => {
    const user = userEvent.setup();
    const { props } = renderView();

    await user.click(command('publish'));
    await user.click(screen.getByTestId('visual-publish-mobile'));

    expect(props.onPublish).toHaveBeenCalledTimes(2);
  });

  it('disables both publish controls while publishing', () => {
    renderView({ isPublishing: true });

    expect(command('publish')).toBeDisabled();
    expect(screen.getByTestId('visual-publish-mobile')).toBeDisabled();
  });

  it('opens the published site in a new tab from the command row and the mobile bar', () => {
    renderView();

    for (const link of [command('view-live'), screen.getByTestId('visual-view-live-mobile')]) {
      expect(link).toHaveAttribute('href', '/tenant-a');
      expect(link).toHaveAttribute('target', '_blank');
      expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'));
    }
  });

  it('shows the publish result banner in its slot', () => {
    renderView({ actionBanner: { kind: 'publish', status: 'success' } });

    expect(
      within(screen.getByTestId('visual-banner-slot')).getByTestId('hotsite-action-success-banner'),
    ).toBeInTheDocument();
  });

  it('places the preview before the inspector in document order', () => {
    renderView();

    const preview = screen.getByTestId('visual-preview');
    const inspector = screen.getByTestId('visual-inspector');

    expect(
      preview.compareDocumentPosition(inspector) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('makes the inspector a labelled, sticky and independently scrollable complementary region', () => {
    renderView();

    const inspector = screen.getByRole('complementary', { name: 'Detalhes da seção' });
    expect(inspector).toBe(screen.getByTestId('visual-inspector'));
    expect(inspector).toHaveClass('lg:sticky', 'lg:overflow-y-auto');
  });

  it('shows the neutral empty state when nothing is selected', () => {
    renderView();

    expect(screen.getByTestId('visual-inspector')).toHaveTextContent(
      'Selecione uma seção da prévia para ver os detalhes.',
    );
    expect(screen.getByTestId('visual-preview-status')).toHaveTextContent(
      'Rascunho — selecione uma seção da prévia',
    );
    expect(screen.getByTestId('mock-canvas')).toHaveAttribute('data-selected', '');
  });

  it('reports a section picked in the preview', async () => {
    const user = userEvent.setup();
    const { props } = renderView();

    await user.click(screen.getByTestId('mock-select-contact'));

    expect(props.onSelectModule).toHaveBeenCalledWith('CONTACT');
  });

  it('names the selected module in the preview status and the inspector, with an Edit in detail action', async () => {
    const user = userEvent.setup();
    const { props } = renderView({
      draft: DRAFT_WITH_CONTACT,
      visualContext: { kind: 'module', type: 'CONTACT', localData: {} },
    });

    expect(screen.getByTestId('mock-canvas')).toHaveAttribute('data-selected', 'CONTACT');
    expect(screen.getByTestId('visual-preview-status')).toHaveTextContent(
      'Rascunho — selecionado: Contato',
    );
    const inspector = screen.getByTestId('visual-inspector');
    expect(within(inspector).getByRole('heading', { name: 'Contato' })).toBeInTheDocument();
    expect(inspector).toHaveTextContent('Os campos deste módulo chegam em breve');

    await user.click(within(inspector).getByTestId('visual-inspector-edit-in-detail'));
    expect(props.onEditInDetail).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['disabled', [{ type: 'CONTACT' as const, enabled: false, data: {} }]],
    ['absent', []],
  ])(
    'treats a selected module that is %s in the draft as unselected, so nothing stale is named',
    (_label, layout) => {
      renderView({
        draft: { ...DRAFT, layout },
        visualContext: { kind: 'module', type: 'CONTACT', localData: {} },
      });

      expect(screen.getByTestId('mock-canvas')).toHaveAttribute('data-selected', '');
      expect(screen.getByTestId('visual-preview-status')).toHaveTextContent(
        'Rascunho — selecione uma seção da prévia',
      );
      expect(screen.getByTestId('visual-inspector')).toHaveTextContent(
        'Selecione uma seção da prévia para ver os detalhes.',
      );
    },
  );

  it('resets only the inspector scroll to the top when the context changes, never the window', () => {
    const scrollTo = vi.spyOn(globalThis, 'scrollTo').mockImplementation(() => {});
    const { rerender, props } = renderView();
    const inspector = screen.getByTestId('visual-inspector');
    inspector.scrollTop = 120;

    rerender(
      <VisualHotsiteEditorView
        {...props}
        draft={DRAFT_WITH_CONTACT}
        visualContext={{ kind: 'module', type: 'CONTACT', localData: {} }}
      />,
    );

    expect(inspector.scrollTop).toBe(0);
    expect(scrollTo).not.toHaveBeenCalled();
    scrollTo.mockRestore();
  });

  it('has no accessibility violations', async () => {
    const { container } = renderView({
      draft: DRAFT_WITH_CONTACT,
      visualContext: { kind: 'module', type: 'CONTACT', localData: {} },
    });

    expect(await axe(container)).toHaveNoViolations();
  });
});
