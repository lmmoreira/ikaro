// @vitest-environment jsdom
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { describe, expect, it, vi } from 'vitest';
import type { HotsiteModuleResponse, HotsiteModuleType } from '@ikaro/types';
import { renderWithIntl } from '@/test-utils';
import { VisualModuleInspector } from './VisualModuleInspector';

// The ten real panels are covered by their own specs; one stand-in proves the inspector hosts a
// panel, passes it the buffer and takes its edits.
vi.mock('./hotsite-editor-lazy-panels', () => ({
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
          <label>
            Título
            <input
              data-testid="mock-panel-title"
              value={String(data.title ?? '')}
              onChange={(event) => onChange({ ...data, title: event.target.value })}
            />
          </label>
        ),
    },
  ),
}));

const LAYOUT: HotsiteModuleResponse[] = [
  { type: 'HERO', enabled: true, data: {} },
  { type: 'SERVICE_LIST', enabled: false, data: {} },
  { type: 'CONTACT', enabled: true, data: {} },
];

function renderInspector(
  overrides: Partial<React.ComponentProps<typeof VisualModuleInspector>> = {},
) {
  const onConfigure = vi.fn<(type: HotsiteModuleType) => void>();
  const props = {
    layout: LAYOUT,
    buffer: null,
    discardConfirmOpen: false,
    onLayoutChange: vi.fn(),
    onConfigure,
    onBufferChange: vi.fn(),
    onApply: vi.fn(),
    onLeaveModule: vi.fn(),
    onConfirmDiscard: vi.fn(),
    onKeepEditing: vi.fn(),
    ...overrides,
  };
  return { ...renderWithIntl(<VisualModuleInspector {...props} />), props, onConfigure };
}

describe('VisualModuleInspector — structure (Organize modules)', () => {
  it('lists every module in the draft order, disabled ones included', () => {
    renderInspector();

    expect(screen.getByRole('heading', { name: 'Estrutura da página' })).toBeInTheDocument();
    expect(screen.getAllByTestId('layout-row').map((row) => row.dataset.moduleType)).toEqual([
      'HERO',
      'SERVICE_LIST',
      'CONTACT',
    ]);
  });

  it('turns a module off and on from its toggle', async () => {
    const user = userEvent.setup();
    const { props } = renderInspector();

    await user.click(screen.getByTestId('layout-row-toggle-HERO'));

    expect(props.onLayoutChange).toHaveBeenCalledWith([
      { type: 'HERO', enabled: false, data: {} },
      LAYOUT[1],
      LAYOUT[2],
    ]);
  });

  it('configures an enabled or a disabled module from its row', async () => {
    const user = userEvent.setup();
    const { onConfigure } = renderInspector();
    const configure = screen
      .getAllByTestId('layout-row-configure')
      .map((button) => [button.dataset.moduleType, button] as const);

    for (const [, button] of configure) await user.click(button);

    expect(onConfigure.mock.calls.map(([type]) => type)).toEqual([
      'HERO',
      'SERVICE_LIST',
      'CONTACT',
    ]);
  });

  it('offers no Apply or Cancel while no module is open', () => {
    renderInspector();

    expect(screen.queryByTestId('visual-inspector-apply')).not.toBeInTheDocument();
    expect(screen.queryByTestId('visual-inspector-cancel')).not.toBeInTheDocument();
  });
});

describe('VisualModuleInspector — module panel', () => {
  const buffer = { type: 'CONTACT', localData: { title: 'Fale conosco' } } as const;

  it("hosts the open module's panel on its buffer and reports edits", async () => {
    const user = userEvent.setup();
    const { props } = renderInspector({ buffer });

    expect(screen.getByRole('heading', { name: 'Contato' })).toBeInTheDocument();
    expect(screen.queryByTestId('visual-structure')).not.toBeInTheDocument();
    const field = screen.getByTestId('mock-panel-title');
    expect(field).toHaveValue('Fale conosco');

    await user.type(field, '!');

    expect(props.onBufferChange).toHaveBeenCalledWith({ title: 'Fale conosco!' });
  });

  it('moves focus to the module heading when a module opens, without scrolling the page', () => {
    const scrollTo = vi.spyOn(globalThis, 'scrollTo').mockImplementation(() => {});
    renderInspector({ buffer });

    expect(screen.getByRole('heading', { name: 'Contato' })).toHaveFocus();
    expect(scrollTo).not.toHaveBeenCalled();
    scrollTo.mockRestore();
  });

  it('applies from Apply and leaves from both the back control and Cancel', async () => {
    const user = userEvent.setup();
    const { props } = renderInspector({ buffer });

    await user.click(screen.getByTestId('visual-inspector-apply'));
    await user.click(screen.getByTestId('visual-inspector-back'));
    await user.click(screen.getByTestId('visual-inspector-cancel'));

    expect(props.onApply).toHaveBeenCalledTimes(1);
    expect(props.onLeaveModule).toHaveBeenCalledTimes(2);
  });

  it('notes that a disabled module is not shown in the preview, and keeps its fields editable', () => {
    renderInspector({ buffer: { type: 'SERVICE_LIST', localData: {} } });

    expect(screen.getByTestId('visual-inspector-disabled-note')).toHaveTextContent(
      'Este módulo está desativado e por isso não aparece na prévia.',
    );
    expect(screen.getByTestId('mock-panel-title')).toBeEnabled();
  });

  it('shows no note for an enabled module', () => {
    renderInspector({ buffer });

    expect(screen.queryByTestId('visual-inspector-disabled-note')).not.toBeInTheDocument();
  });

  it('shows the discard confirmation only while it is open', () => {
    const { rerender, props } = renderInspector({ buffer });
    expect(screen.queryByTestId('visual-module-discard-confirm')).not.toBeInTheDocument();

    rerender(<VisualModuleInspector {...props} buffer={buffer} discardConfirmOpen />);

    expect(screen.getByText('Descartar alterações?')).toBeInTheDocument();
    expect(screen.getByTestId('visual-module-discard-confirm')).toBeInTheDocument();
  });

  it('discards from the confirmation', async () => {
    const user = userEvent.setup();
    const { props } = renderInspector({ buffer, discardConfirmOpen: true });

    await user.click(screen.getByTestId('visual-module-discard-confirm'));

    expect(props.onConfirmDiscard).toHaveBeenCalledTimes(1);
  });

  it('keeps editing from the confirmation cancel, without discarding', async () => {
    const user = userEvent.setup();
    const { props } = renderInspector({ buffer, discardConfirmOpen: true });

    await user.click(screen.getByRole('button', { name: 'Continuar editando' }));

    expect(props.onKeepEditing).toHaveBeenCalledTimes(1);
    expect(props.onConfirmDiscard).not.toHaveBeenCalled();
  });
});

describe('VisualModuleInspector — accessibility', () => {
  it('has no violations on the structure list', async () => {
    const { container } = renderInspector();

    expect(await axe(container)).toHaveNoViolations();
  });

  it('has no violations on an open module panel', async () => {
    const { container } = renderInspector({
      buffer: { type: 'CONTACT', localData: { title: 'Fale conosco' } },
    });

    expect(await axe(container)).toHaveNoViolations();
    expect(within(container).getByTestId('visual-module-inspector')).toBeInTheDocument();
  });
});
