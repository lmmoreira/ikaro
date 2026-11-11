// @vitest-environment jsdom
import { createRef } from 'react';
import { render, screen } from '@testing-library/react';
import { axe } from '@/axe-helper';
import { describe, expect, it } from 'vitest';
import { BrandedInput } from './branded-input';

describe('BrandedInput', () => {
  it('draws the field on the secondary surface with the derived text colour, radius and field border', () => {
    render(<BrandedInput data-testid="field" />);

    const field = screen.getByTestId('field');
    expect(field.style.backgroundColor).toBe('var(--ba-secondary)');
    expect(field.style.color).toBe('var(--ba-secondary-text)');
    expect(field.style.borderRadius).toBe('var(--ba-radius)');
    expect(field.style.borderColor).toBe('var(--ba-field-border)');
  });

  it('merges the caller className with the border width and the placeholder tint', () => {
    render(<BrandedInput data-testid="field" className="w-full px-3" />);

    const field = screen.getByTestId('field');
    expect(field).toHaveClass('border', 'w-full', 'px-3');
    expect(field.className).toContain('placeholder:[color:var(--ba-secondary-muted');
    expect(field).not.toHaveClass('border-red-600');
    expect(field).not.toHaveAttribute('aria-invalid');
  });

  it('paints the fixed red outline and sets aria-invalid when invalid, leaving no inline border colour', () => {
    render(<BrandedInput data-testid="field" invalid />);

    const field = screen.getByTestId('field');
    expect(field).toHaveClass('border-red-600', 'ring-red-600');
    expect(field).toHaveAttribute('aria-invalid', 'true');
    expect(field.style.borderColor).toBe('');
  });

  it('forwards the ref and every other prop', () => {
    const ref = createRef<HTMLInputElement>();
    render(
      <BrandedInput
        ref={ref}
        data-testid="field"
        type="tel"
        aria-describedby="hint"
        placeholder="(11) 91234-5678"
      />,
    );

    expect(ref.current).toBe(screen.getByTestId('field'));
    expect(ref.current).toHaveAttribute('type', 'tel');
    expect(ref.current).toHaveAttribute('aria-describedby', 'hint');
    expect(ref.current).toHaveAttribute('placeholder', '(11) 91234-5678');
  });

  it('lets a caller override only the radius, so a prefix/input pair can join its corners', () => {
    render(<BrandedInput data-testid="field" style={{ borderRadius: '0 8px 8px 0' }} />);

    const field = screen.getByTestId('field');
    expect(field.style.borderRadius).toBe('0 8px 8px 0');
    expect(field.style.backgroundColor).toBe('var(--ba-secondary)');
  });

  it('does not type-check a colour override', () => {
    const colour = { style: { backgroundColor: 'red' } };

    // @ts-expect-error only borderRadius may be passed through `style`
    const element = <BrandedInput data-testid="typed" {...colour} />;
    render(element);

    expect(screen.getByTestId('typed')).toBeInTheDocument();
  });

  it('never paints --ba-text or --ba-primary and never removes the focus outline', () => {
    for (const invalid of [false, true]) {
      const { container, unmount } = render(<BrandedInput invalid={invalid} className="w-full" />);
      const field = container.querySelector('input') as HTMLInputElement;
      const markup = `${field.getAttribute('style') ?? ''} ${field.className}`;

      expect(markup).not.toContain('--ba-text');
      expect(markup).not.toContain('--ba-primary');
      expect(markup).not.toContain('outline-none');
      expect(field.style.outline).toBe('');
      unmount();
    }
  });

  it('has no axe violations with a label', async () => {
    const { container } = render(
      <>
        <label htmlFor="name">Nome</label>
        <BrandedInput id="name" />
      </>,
    );

    expect(await axe(container)).toHaveNoViolations();
  });
});
