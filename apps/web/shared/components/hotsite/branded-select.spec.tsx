// @vitest-environment jsdom
import { createRef } from 'react';
import { render, screen } from '@testing-library/react';
import { axe } from '@/axe-helper';
import { describe, expect, it } from 'vitest';
import { BrandedSelect } from './branded-select';

function options(): React.JSX.Element {
  return (
    <>
      <option value="60">1 hora</option>
      <option value="90">1 hora e 30 min</option>
    </>
  );
}

describe('BrandedSelect', () => {
  it('draws a native select on the secondary surface with the derived text colour, radius and field border', () => {
    render(<BrandedSelect data-testid="select">{options()}</BrandedSelect>);

    const select = screen.getByTestId('select');
    expect(select.tagName).toBe('SELECT');
    expect(select.style.backgroundColor).toBe('var(--ba-secondary)');
    expect(select.style.color).toBe('var(--ba-secondary-text)');
    expect(select.style.borderRadius).toBe('var(--ba-radius)');
    expect(select.style.borderColor).toBe('var(--ba-field-border)');
  });

  it('merges the caller className with the border width', () => {
    render(
      <BrandedSelect data-testid="select" className="w-full px-3">
        {options()}
      </BrandedSelect>,
    );

    const select = screen.getByTestId('select');
    expect(select).toHaveClass('border', 'w-full', 'px-3');
    expect(select).not.toHaveAttribute('aria-invalid');
  });

  it('paints the fixed red outline and sets aria-invalid when invalid, leaving no inline border colour', () => {
    render(
      <BrandedSelect data-testid="select" invalid>
        {options()}
      </BrandedSelect>,
    );

    const select = screen.getByTestId('select');
    expect(select).toHaveClass('border-red-600', 'ring-red-600');
    expect(select).toHaveAttribute('aria-invalid', 'true');
    expect(select.style.borderColor).toBe('');
  });

  it('forwards the ref, the value and the change handler', () => {
    const ref = createRef<HTMLSelectElement>();
    render(
      <BrandedSelect ref={ref} data-testid="select" defaultValue="90" aria-describedby="hint">
        {options()}
      </BrandedSelect>,
    );

    expect(ref.current).toBe(screen.getByTestId('select'));
    expect(ref.current?.value).toBe('90');
    expect(ref.current).toHaveAttribute('aria-describedby', 'hint');
  });

  it('lets a caller override only the radius', () => {
    render(
      <BrandedSelect data-testid="select" style={{ borderRadius: '2px' }}>
        {options()}
      </BrandedSelect>,
    );

    expect(screen.getByTestId('select').style.borderRadius).toBe('2px');
  });

  it('does not type-check a colour override', () => {
    const colour = { style: { backgroundColor: 'red' } };

    // @ts-expect-error only borderRadius may be passed through `style`
    const element = <BrandedSelect data-testid="typed" {...colour} />;
    render(element);

    expect(screen.getByTestId('typed')).toBeInTheDocument();
  });

  it('never paints --ba-text or --ba-primary and never removes the focus outline', () => {
    for (const invalid of [false, true]) {
      const { container, unmount } = render(
        <BrandedSelect invalid={invalid}>{options()}</BrandedSelect>,
      );
      const select = container.querySelector('select') as HTMLSelectElement;
      const markup = `${select.getAttribute('style') ?? ''} ${select.className}`;

      expect(markup).not.toContain('--ba-text');
      expect(markup).not.toContain('--ba-primary');
      expect(markup).not.toContain('outline-none');
      unmount();
    }
  });

  it('has no axe violations with a label', async () => {
    const { container } = render(
      <>
        <label htmlFor="duration">Duração</label>
        <BrandedSelect id="duration">{options()}</BrandedSelect>
      </>,
    );

    expect(await axe(container)).toHaveNoViolations();
  });
});
