// @vitest-environment jsdom
import { createRef } from 'react';
import { render, screen } from '@testing-library/react';
import { axe } from '@/axe-helper';
import { describe, expect, it } from 'vitest';
import { BrandedTextarea } from './branded-textarea';

describe('BrandedTextarea', () => {
  it('draws the field on the secondary surface with the derived text colour, radius and field border', () => {
    render(<BrandedTextarea data-testid="area" />);

    const area = screen.getByTestId('area');
    expect(area.style.backgroundColor).toBe('var(--ba-secondary)');
    expect(area.style.color).toBe('var(--ba-secondary-text)');
    expect(area.style.borderRadius).toBe('var(--ba-radius)');
    expect(area.style.borderColor).toBe('var(--ba-field-border)');
  });

  it('merges the caller className with the border width and the placeholder tint', () => {
    render(<BrandedTextarea data-testid="area" className="min-h-28 w-full" />);

    const area = screen.getByTestId('area');
    expect(area).toHaveClass('border', 'min-h-28', 'w-full');
    expect(area.className).toContain('placeholder:[color:var(--ba-secondary-muted');
    expect(area).not.toHaveAttribute('aria-invalid');
  });

  it('paints the fixed red outline and sets aria-invalid when invalid, leaving no inline border colour', () => {
    render(<BrandedTextarea data-testid="area" invalid />);

    const area = screen.getByTestId('area');
    expect(area).toHaveClass('border-red-600', 'ring-red-600');
    expect(area).toHaveAttribute('aria-invalid', 'true');
    expect(area.style.borderColor).toBe('');
  });

  it('forwards the ref and every other prop', () => {
    const ref = createRef<HTMLTextAreaElement>();
    render(<BrandedTextarea ref={ref} data-testid="area" rows={5} aria-describedby="hint" />);

    expect(ref.current).toBe(screen.getByTestId('area'));
    expect(ref.current).toHaveAttribute('rows', '5');
    expect(ref.current).toHaveAttribute('aria-describedby', 'hint');
  });

  it('lets a caller override only the radius', () => {
    render(<BrandedTextarea data-testid="area" style={{ borderRadius: '4px' }} />);

    const area = screen.getByTestId('area');
    expect(area.style.borderRadius).toBe('4px');
    expect(area.style.color).toBe('var(--ba-secondary-text)');
  });

  it('does not type-check a colour override', () => {
    const colour = { style: { color: 'red' } };

    // @ts-expect-error only borderRadius may be passed through `style`
    const element = <BrandedTextarea data-testid="typed" {...colour} />;
    render(element);

    expect(screen.getByTestId('typed')).toBeInTheDocument();
  });

  it('never paints --ba-text or --ba-primary and never removes the focus outline', () => {
    for (const invalid of [false, true]) {
      const { container, unmount } = render(<BrandedTextarea invalid={invalid} />);
      const area = container.querySelector('textarea') as HTMLTextAreaElement;
      const markup = `${area.getAttribute('style') ?? ''} ${area.className}`;

      expect(markup).not.toContain('--ba-text');
      expect(markup).not.toContain('--ba-primary');
      expect(markup).not.toContain('outline-none');
      unmount();
    }
  });

  it('has no axe violations with a label', async () => {
    const { container } = render(
      <>
        <label htmlFor="msg">Mensagem</label>
        <BrandedTextarea id="msg" />
      </>,
    );

    expect(await axe(container)).toHaveNoViolations();
  });
});
