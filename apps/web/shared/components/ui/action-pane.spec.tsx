// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ActionPane } from './action-pane';

const ERROR = {
  variant: 'error',
  title: 'Não foi possível salvar',
  body: 'Informe o mínimo',
} as const;

function follows(first: Node, second: Node): boolean {
  return Boolean(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING);
}

describe('ActionPane', () => {
  it('renders the feedback below the actions in the sticky desktop pane', () => {
    render(<ActionPane actions={<button type="button">Salvar</button>} feedback={ERROR} />);

    const pane = screen.getByTestId('action-pane-desktop');
    expect(pane.className).toContain('lg:sticky');
    expect(pane.className).toContain('lg:top-6');
    const feedback = screen.getByTestId('form-feedback');
    expect(pane).toContainElement(feedback);
    expect(follows(pane.querySelector('button') as HTMLElement, feedback)).toBe(true);
    expect(feedback).toHaveTextContent('Informe o mínimo');
  });

  it('renders the feedback above the buttons in the fixed mobile bar, bounded in height', () => {
    render(<ActionPane actions={<button type="button">Salvar</button>} feedback={ERROR} />);

    const bar = screen.getByTestId('action-pane-mobile');
    expect(bar.className).toContain('fixed');
    const feedback = screen.getByTestId('form-feedback-mobile');
    expect(bar).toContainElement(feedback);
    expect(feedback.parentElement?.className).toContain('overflow-y-auto');
    expect(follows(feedback, bar.querySelector('button') as HTMLElement)).toBe(true);
  });

  it('renders no empty feedback box when there is no message', () => {
    render(<ActionPane actions={<button type="button">Salvar</button>} />);

    expect(screen.queryByTestId('form-feedback')).not.toBeInTheDocument();
    expect(screen.queryByTestId('form-feedback-mobile')).not.toBeInTheDocument();
  });

  it('puts the mobile bar at the bottom by default and honours a caller offset', () => {
    const { rerender } = render(<ActionPane actions={<button type="button">Salvar</button>} />);
    expect(screen.getByTestId('action-pane-mobile').className).toContain('bottom-0');

    rerender(
      <ActionPane
        actions={<button type="button">Salvar</button>}
        mobileOffsetClassName="bottom-16"
      />,
    );
    const bar = screen.getByTestId('action-pane-mobile');
    expect(bar.className).toContain('bottom-16');
    expect(bar.className).not.toContain('bottom-0');
  });

  it('uses mobile-specific actions when given, and no bar when they are null', () => {
    const { rerender } = render(
      <ActionPane
        actions={<button type="button">Salvar desktop</button>}
        mobileActions={<button type="button">Salvar mobile</button>}
      />,
    );
    const bar = screen.getByTestId('action-pane-mobile');
    expect(bar).toHaveTextContent('Salvar mobile');
    expect(bar).not.toHaveTextContent('Salvar desktop');

    rerender(<ActionPane actions={<button type="button">Salvar</button>} mobileActions={null} />);
    expect(screen.queryByTestId('action-pane-mobile')).not.toBeInTheDocument();
  });
});
