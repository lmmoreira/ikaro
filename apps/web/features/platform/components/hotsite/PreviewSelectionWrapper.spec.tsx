// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { describe, expect, it, vi } from 'vitest';
import { renderWithIntl } from '@/test-utils';
import { PreviewSelectionWrapper } from './PreviewSelectionWrapper';

function renderWrapper(
  overrides: Partial<React.ComponentProps<typeof PreviewSelectionWrapper>> = {},
) {
  const onSelect = vi.fn();
  const rendered = renderWithIntl(
    <PreviewSelectionWrapper
      type="HERO"
      selected={false}
      fixedOverlay={false}
      onSelect={onSelect}
      {...overrides}
    >
      <section data-testid="module">
        <a href="https://example.test/book">Agendar agora</a>
      </section>
    </PreviewSelectionWrapper>,
  );
  return { ...rendered, onSelect };
}

describe('PreviewSelectionWrapper', () => {
  // Negative guarantee: nothing inside a selectable preview section can run a visitor action
  // (follow a CTA, start a booking, open the chat). `inert` is what enforces it in the browser.
  it('renders the module inside an inert subtree so its visitor actions cannot run', () => {
    renderWrapper();

    expect(screen.getByTestId('module').closest('[inert]')).not.toBeNull();
    expect(screen.getByRole('button', { name: /Selecionar seção/ }).closest('[inert]')).toBeNull();
  });

  it('exposes one overlay button named after the module', () => {
    renderWrapper({ type: 'CONTACT' });

    expect(screen.getByRole('button', { name: 'Selecionar seção: Contato' })).toBeInTheDocument();
    expect(screen.getByTestId('preview-section')).toHaveAttribute('data-module-type', 'CONTACT');
  });

  it('reports the module type when the overlay is clicked', async () => {
    const user = userEvent.setup();
    const { onSelect } = renderWrapper({ type: 'CONTACT' });

    await user.click(screen.getByTestId('preview-section-select'));

    expect(onSelect).toHaveBeenCalledWith('CONTACT');
  });

  it.each([['{Enter}'], [' ']])('activates from the keyboard with %j', async (key) => {
    const user = userEvent.setup();
    const { onSelect } = renderWrapper();

    // jsdom does not implement `inert`, so a Tab would land on the module's own link here; in a
    // browser the overlay is the only tab stop in the section. Focus it directly.
    screen.getByTestId('preview-section-select').focus();
    await user.keyboard(key);

    expect(onSelect).toHaveBeenCalledWith('HERO');
  });

  it('marks the selected section as pressed and shows its badge', () => {
    renderWrapper({ selected: true });

    expect(screen.getByTestId('preview-section-select')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('preview-section-badge')).toHaveTextContent('Selecionado · Hero');
  });

  it('leaves an unselected section unpressed and without a badge', () => {
    renderWrapper();

    expect(screen.getByTestId('preview-section-select')).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByTestId('preview-section-badge')).not.toBeInTheDocument();
  });

  it('offers no overlay while the module has rendered nothing (e.g. an unavailable chatbot)', () => {
    renderWithIntl(
      <PreviewSelectionWrapper type="CHATBOT" selected={false} fixedOverlay onSelect={vi.fn()}>
        {null}
      </PreviewSelectionWrapper>,
    );

    expect(screen.queryByTestId('preview-section-select')).not.toBeInTheDocument();
  });

  it('offers the overlay once the module renders its content', async () => {
    const wrapper = (child: React.ReactNode) => (
      <PreviewSelectionWrapper type="CHATBOT" selected={false} fixedOverlay onSelect={vi.fn()}>
        {child}
      </PreviewSelectionWrapper>
    );
    const { rerender } = renderWithIntl(wrapper(null));
    expect(screen.queryByTestId('preview-section-select')).not.toBeInTheDocument();

    rerender(wrapper(<button type="button">bubble</button>));

    expect(await screen.findByTestId('preview-section-select')).toBeInTheDocument();
  });

  it('pins a fixed-position module (the chatbot bubble) to its own corner, without a badge', () => {
    renderWrapper({ type: 'CHATBOT', fixedOverlay: true, selected: true });

    const overlay = screen.getByTestId('preview-section-select');
    expect(overlay).toHaveClass('fixed');
    expect(screen.queryByTestId('preview-section-badge')).not.toBeInTheDocument();
  });

  it('fills the section with the overlay for an in-flow module', () => {
    renderWrapper();

    expect(screen.getByTestId('preview-section-select')).toHaveClass('absolute', 'inset-0');
  });

  it('has no accessibility violations', async () => {
    const { container } = renderWrapper({ selected: true });

    expect(await axe(container)).toHaveNoViolations();
  });
});
