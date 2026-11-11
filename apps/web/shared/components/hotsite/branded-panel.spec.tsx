// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { axe } from '@/axe-helper';
import { describe, expect, it } from 'vitest';
import { BrandedPanel } from './branded-panel';

describe('BrandedPanel', () => {
  it('renders its children on the secondary surface with the derived text colour and radius', () => {
    render(
      <BrandedPanel testId="panel">
        <p>Mensagem</p>
      </BrandedPanel>,
    );

    const panel = screen.getByTestId('panel');
    expect(panel).toHaveTextContent('Mensagem');
    expect(panel.style.backgroundColor).toBe('var(--ba-secondary)');
    expect(panel.style.color).toBe('var(--ba-secondary-text)');
    expect(panel.style.borderRadius).toBe('var(--ba-radius)');
  });

  it('renders the label in the derived accent colour', () => {
    render(
      <BrandedPanel label="Mensagem da equipe">
        <p>Texto</p>
      </BrandedPanel>,
    );

    expect(screen.getByText('Mensagem da equipe').style.color).toBe(
      'var(--ba-secondary-accent, var(--ba-secondary-text))',
    );
  });

  it('renders no heading when there is no label', () => {
    const { container } = render(
      <BrandedPanel>
        <span>Só conteúdo</span>
      </BrandedPanel>,
    );

    expect(container.querySelectorAll('p')).toHaveLength(0);
  });

  it('forwards className and testId', () => {
    render(
      <BrandedPanel className="mb-6 p-4" testId="forwarded">
        <span>x</span>
      </BrandedPanel>,
    );

    const panel = screen.getByTestId('forwarded');
    expect(panel).toHaveClass('mb-6', 'p-4', 'border');
  });

  it('never paints --ba-primary or --ba-text as a colour, with or without a label', () => {
    const { container } = render(
      <BrandedPanel label="Rótulo" testId="neg">
        <span>Texto</span>
      </BrandedPanel>,
    );

    expect(container.innerHTML).not.toContain('--ba-text');
    expect(container.innerHTML).not.toContain('--ba-primary');
  });

  it('has no accessibility violations', async () => {
    const { container } = render(
      <BrandedPanel label="Mensagem da equipe">
        <p>Texto</p>
      </BrandedPanel>,
    );

    expect(await axe(container)).toHaveNoViolations();
  });
});
