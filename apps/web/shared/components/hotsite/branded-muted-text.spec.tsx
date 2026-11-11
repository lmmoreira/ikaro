// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { axe } from '@/axe-helper';
import { BrandedMutedText } from './branded-muted-text';

describe('BrandedMutedText', () => {
  it('renders a paragraph in the derived muted colour by default', () => {
    render(<BrandedMutedText testId="muted">Dica</BrandedMutedText>);

    const line = screen.getByTestId('muted');
    expect(line.tagName).toBe('P');
    expect(line).toHaveTextContent('Dica');
    expect(line.style.color).toBe('var(--ba-secondary-muted, var(--ba-secondary-text))');
  });

  it.each(['span', 'div'] as const)('renders a %s on request', (tag) => {
    render(
      <BrandedMutedText as={tag} testId="muted">
        Dica
      </BrandedMutedText>,
    );

    expect(screen.getByTestId('muted').tagName).toBe(tag.toUpperCase());
  });

  it('forwards className and testId', () => {
    render(
      <BrandedMutedText className="mt-3 text-sm" testId="forwarded">
        Dica
      </BrandedMutedText>,
    );

    expect(screen.getByTestId('forwarded')).toHaveClass('mt-3', 'text-sm');
  });

  it('never dims with opacity and never uses --ba-text or --ba-primary', () => {
    const { container } = render(<BrandedMutedText>Dica</BrandedMutedText>);

    expect(container.innerHTML).not.toMatch(/opacity/);
    expect(container.innerHTML).not.toContain('--ba-text');
    expect(container.innerHTML).not.toContain('--ba-primary');
  });

  it('has no accessibility violations', async () => {
    const { container } = render(<BrandedMutedText>Dica</BrandedMutedText>);

    expect(await axe(container)).toHaveNoViolations();
  });
});
