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
// view hands it the draft (with the open buffer merged in) and a selection that reports back. The
// real panels are covered by their own specs; one stand-in proves the inspector hosts a panel.
vi.mock('./hotsite-editor-lazy-panels', () => ({
  HotsitePreviewCanvas: ({
    draft,
    selection,
  }: {
    draft: { layout: { type: string; data: Record<string, unknown> }[] };
    selection?: {
      selectedType: string | null;
      onSelect: (type: 'CONTACT') => void;
    };
  }) => {
    const contact = draft.layout.find((module) => module.type === 'CONTACT');
    const leadForm = draft.layout.find((module) => module.type === 'LEAD_FORM');
    return (
      <div
        data-testid="mock-canvas"
        data-selected={selection?.selectedType ?? ''}
        data-contact-title={String(contact?.data.title ?? '')}
        data-lead-form-keys={Object.keys(leadForm?.data ?? {}).join(',')}
      >
        <button
          type="button"
          data-testid="mock-select-contact"
          onClick={() => selection?.onSelect('CONTACT')}
        >
          select contact
        </button>
      </div>
    );
  },
  MODULE_CONFIG_PANELS: new Proxy(
    {},
    {
      get:
        () =>
        ({
          data,
          onChange,
        }: {
          data: Record<string, unknown>;
          onChange: (next: Record<string, unknown>) => void;
        }) => (
          <input
            aria-label="Título"
            data-testid="mock-panel-title"
            value={String(data.title ?? '')}
            onChange={(event) => onChange({ ...data, title: event.target.value })}
          />
        ),
    },
  ),
}));

// The real tabs and the sharing simulation have their own specs (they fetch and upload); here they
// only need to prove the view hosts them with the draft slice they edit and reports their changes.
vi.mock('./BrandingTab', () => ({
  BrandingTab: ({
    value,
    onChange,
  }: {
    value: { primaryColor: string };
    onChange: (next: { primaryColor: string }) => void;
  }) => (
    <input
      aria-label="Cor primária"
      data-testid="mock-branding-tab"
      value={value.primaryColor}
      onChange={(event) => onChange({ ...value, primaryColor: event.target.value })}
    />
  ),
}));
vi.mock('./SeoTab', () => ({
  SeoTab: ({
    value,
    onChange,
  }: {
    value: { title: string | null };
    onChange: (next: { title: string | null }) => void;
  }) => (
    <input
      aria-label="Título"
      data-testid="mock-seo-tab"
      value={value.title ?? ''}
      onChange={(event) => onChange({ ...value, title: event.target.value })}
    />
  ),
}));
vi.mock('./HotsiteSharingPreview', () => ({
  HotsiteSharingPreview: ({
    seo,
    tenantSlug,
  }: {
    seo: { title: string | null };
    tenantSlug: string;
  }) => (
    <div data-testid="mock-sharing-preview" data-title={seo.title ?? ''} data-slug={tenantSlug} />
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
    publishBlocked: false,
    inspector: {
      discardConfirmOpen: false,
      onLayoutChange: vi.fn(),
      onBufferChange: vi.fn(),
      onApply: vi.fn(),
      onLeaveModule: vi.fn(),
      onConfirmDiscard: vi.fn(),
      onKeepEditing: vi.fn(),
    },
    onSelectModule: vi.fn(),
    onShowContext: vi.fn(),
    onBrandingChange: vi.fn(),
    onSeoChange: vi.fn(),
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

  it.each(['branding', 'structure', 'sharing'] as const)(
    'enables the %s command and requests that context',
    async (name) => {
      const user = userEvent.setup();
      const { props } = renderView();

      expect(command(name)).toBeEnabled();
      await user.click(command(name));

      expect(props.onShowContext).toHaveBeenCalledWith(name);
    },
  );

  it.each([
    [{ kind: 'structure' }, 'structure'],
    [{ kind: 'branding' }, 'branding'],
    [{ kind: 'sharing' }, 'sharing'],
    [{ kind: 'module', type: 'CONTACT', localData: {} }, null],
  ] as const)('marks only the current global context as pressed (%o)', (visualContext, pressed) => {
    renderView({
      draft: DRAFT_WITH_CONTACT,
      visualContext: visualContext as VisualContext,
    });

    for (const name of ['branding', 'structure', 'sharing']) {
      expect(command(name)).toHaveAttribute('aria-pressed', String(name === pressed));
    }
  });

  it('hosts the real Branding fields in the inspector and keeps the page preview', async () => {
    const user = userEvent.setup();
    const { props } = renderView({ visualContext: { kind: 'branding' } });

    const inspector = screen.getByTestId('visual-inspector');
    expect(within(inspector).getByTestId('mock-branding-tab')).toHaveValue('#2563eb');
    expect(screen.getByTestId('mock-canvas')).toBeInTheDocument();
    expect(screen.queryByTestId('mock-sharing-preview')).not.toBeInTheDocument();

    await user.type(within(inspector).getByTestId('mock-branding-tab'), '0');

    expect(props.onBrandingChange).toHaveBeenCalledWith(
      expect.objectContaining({ primaryColor: '#2563eb0' }),
    );
  });

  // The Branding fields (colour grid, font picker, logo upload) are the widest content the
  // inspector hosts, so it must keep its 22rem (lg) / 26rem (xl) column and scroll on its own.
  it.each(['structure', 'branding', 'sharing'] as const)(
    'keeps the inspector column at 22rem from lg and 26rem from xl in the %s context',
    (kind) => {
      renderView({ visualContext: { kind } });

      expect(screen.getByTestId('visual-preview').parentElement).toHaveClass(
        'lg:grid-cols-[minmax(0,1fr)_22rem]',
        'xl:grid-cols-[minmax(0,1fr)_26rem]',
      );
      expect(screen.getByTestId('visual-inspector')).toHaveClass('lg:overflow-y-auto');
    },
  );

  it('replaces the page preview with the sharing simulation and hosts the SEO fields', async () => {
    const user = userEvent.setup();
    const { props } = renderView({
      draft: { ...DRAFT, seo: { title: 'Meu site', description: null, ogImageUrl: '' } },
      visualContext: { kind: 'sharing' },
    });

    expect(screen.getByTestId('mock-sharing-preview')).toHaveAttribute('data-title', 'Meu site');
    expect(screen.getByTestId('mock-sharing-preview')).toHaveAttribute('data-slug', 'tenant-a');
    expect(screen.queryByTestId('mock-canvas')).not.toBeInTheDocument();
    expect(screen.queryByTestId('visual-preview-status')).not.toBeInTheDocument();

    await user.type(
      within(screen.getByTestId('visual-inspector')).getByTestId('mock-seo-tab'),
      '!',
    );

    expect(props.onSeoChange).toHaveBeenCalledWith(expect.objectContaining({ title: 'Meu site!' }));
  });

  it('brings the page preview back when leaving Sharing', () => {
    const { rerender, props } = renderView({ visualContext: { kind: 'sharing' } });

    rerender(<VisualHotsiteEditorView {...props} visualContext={{ kind: 'structure' }} />);

    expect(screen.getByTestId('mock-canvas')).toBeInTheDocument();
    expect(screen.queryByTestId('mock-sharing-preview')).not.toBeInTheDocument();
  });

  it('never changes the draft it was given while the context changes (it owns no draft state)', () => {
    const draft = DRAFT_WITH_CONTACT;
    const snapshot = JSON.stringify(draft);
    const { rerender, props } = renderView({ draft, visualContext: { kind: 'branding' } });

    for (const kind of ['sharing', 'structure'] as const) {
      rerender(<VisualHotsiteEditorView {...props} draft={draft} visualContext={{ kind }} />);
    }

    expect(JSON.stringify(draft)).toBe(snapshot);
    expect(props.onBrandingChange).not.toHaveBeenCalled();
    expect(props.onSeoChange).not.toHaveBeenCalled();
  });

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

  it('keeps Publish enabled and shows no hint while the module buffer is clean', () => {
    renderView();

    expect(command('publish')).toBeEnabled();
    expect(screen.getByTestId('visual-publish-mobile')).toBeEnabled();
    expect(screen.queryByTestId('visual-publish-hint')).not.toBeInTheDocument();
  });

  it('disables both publish controls with an "Apply or cancel first" hint while the buffer is dirty', () => {
    renderView({ publishBlocked: true });

    for (const publish of [command('publish'), screen.getByTestId('visual-publish-mobile')]) {
      expect(publish).toBeDisabled();
      expect(publish).toHaveAccessibleDescription('Aplique ou cancele primeiro');
    }
    expect(screen.getByTestId('visual-publish-hint')).toHaveTextContent(
      'Aplique ou cancele primeiro',
    );
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

  it('widens the inspector column from the xl breakpoint', () => {
    renderView();

    const grid = screen.getByTestId('visual-preview').parentElement;
    expect(grid).toHaveClass(
      'lg:grid-cols-[minmax(0,1fr)_22rem]',
      'xl:grid-cols-[minmax(0,1fr)_26rem]',
    );
  });

  it('lists the page structure in the inspector when nothing is selected', () => {
    renderView({
      draft: {
        ...DRAFT,
        layout: [
          { type: 'HERO', enabled: true, data: {} },
          { type: 'CONTACT', enabled: false, data: {} },
        ],
      },
    });

    const structure = screen.getByTestId('visual-structure');
    expect(within(structure).getByRole('heading', { name: 'Estrutura da página' })).toBeVisible();
    expect(
      within(structure)
        .getAllByTestId('layout-row')
        .map((row) => row.dataset.moduleType),
    ).toEqual(['HERO', 'CONTACT']);
  });

  it('opens a module from the structure list through onSelectModule', async () => {
    const user = userEvent.setup();
    const { props } = renderView({ draft: DRAFT_WITH_CONTACT });

    await user.click(screen.getByTestId('layout-row-configure'));

    expect(props.onSelectModule).toHaveBeenCalledWith('CONTACT');
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

  it('names the selected module in the preview status and hosts its panel in the inspector', () => {
    renderView({
      draft: DRAFT_WITH_CONTACT,
      visualContext: { kind: 'module', type: 'CONTACT', localData: { title: 'Fale conosco' } },
    });

    expect(screen.getByTestId('mock-canvas')).toHaveAttribute('data-selected', 'CONTACT');
    expect(screen.getByTestId('visual-preview-status')).toHaveTextContent(
      'Rascunho — selecionado: Contato',
    );
    const inspector = screen.getByTestId('visual-inspector');
    expect(within(inspector).getByRole('heading', { name: 'Contato' })).toBeInTheDocument();
    expect(within(inspector).getByTestId('mock-panel-title')).toHaveValue('Fale conosco');
    expect(within(inspector).queryByTestId('visual-structure')).not.toBeInTheDocument();
  });

  it("shows the open module's unapplied edits in the preview while the shared draft is unchanged", () => {
    renderView({
      draft: { ...DRAFT, layout: [{ type: 'CONTACT', enabled: true, data: { title: 'Antes' } }] },
      visualContext: { kind: 'module', type: 'CONTACT', localData: { title: 'Depois' } },
    });

    expect(screen.getByTestId('mock-canvas')).toHaveAttribute('data-contact-title', 'Depois');
  });

  it('never hands the LeadFormConfig portion of a LEAD_FORM buffer to the preview module', () => {
    renderView({
      draft: { ...DRAFT, layout: [{ type: 'LEAD_FORM', enabled: true, data: { title: 'Olá' } }] },
      visualContext: {
        kind: 'module',
        type: 'LEAD_FORM',
        localData: {
          title: 'Olá',
          audienceMode: 'CUSTOMER_ONLY',
          questions: [{ id: 'q1', hasSubmissions: true }],
        },
      },
    });

    expect(screen.getByTestId('mock-canvas')).toHaveAttribute('data-lead-form-keys', 'title');
  });

  it('forwards panel edits, Apply, Cancel and the back control to the inspector actions', async () => {
    const user = userEvent.setup();
    const { props } = renderView({
      draft: DRAFT_WITH_CONTACT,
      visualContext: { kind: 'module', type: 'CONTACT', localData: {} },
    });

    await user.type(screen.getByTestId('mock-panel-title'), 'a');
    await user.click(screen.getByTestId('visual-inspector-apply'));
    await user.click(screen.getByTestId('visual-inspector-cancel'));
    await user.click(screen.getByTestId('visual-inspector-back'));

    expect(props.inspector.onBufferChange).toHaveBeenCalledWith({ title: 'a' });
    expect(props.inspector.onApply).toHaveBeenCalledTimes(1);
    expect(props.inspector.onLeaveModule).toHaveBeenCalledTimes(2);
  });

  it('keeps a disabled module selected and says it is not shown in the preview', () => {
    renderView({
      draft: { ...DRAFT, layout: [{ type: 'CONTACT', enabled: false, data: {} }] },
      visualContext: { kind: 'module', type: 'CONTACT', localData: {} },
    });

    expect(screen.getByTestId('visual-inspector-disabled-note')).toHaveTextContent(
      'Este módulo está desativado e por isso não aparece na prévia.',
    );
    expect(screen.getByTestId('mock-panel-title')).toBeInTheDocument();
  });

  it('does not show the disabled note for an enabled module', () => {
    renderView({
      draft: DRAFT_WITH_CONTACT,
      visualContext: { kind: 'module', type: 'CONTACT', localData: {} },
    });

    expect(screen.queryByTestId('visual-inspector-disabled-note')).not.toBeInTheDocument();
  });

  it('treats a selected module that is absent from the draft as unselected, so nothing stale is named', () => {
    renderView({
      draft: { ...DRAFT, layout: [] },
      visualContext: { kind: 'module', type: 'CONTACT', localData: {} },
    });

    expect(screen.getByTestId('mock-canvas')).toHaveAttribute('data-selected', '');
    expect(screen.getByTestId('visual-preview-status')).toHaveTextContent(
      'Rascunho — selecione uma seção da prévia',
    );
    expect(screen.getByTestId('visual-structure')).toBeInTheDocument();
  });

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
