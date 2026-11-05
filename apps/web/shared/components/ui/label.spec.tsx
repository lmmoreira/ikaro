// @vitest-environment jsdom
import { createRef } from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { axe } from '@/axe-helper';
import { Input } from './input';
import { Label } from './label';

describe('Label', () => {
  it('associates with a control through htmlFor', () => {
    render(
      <>
        <Label htmlFor="name">Name</Label>
        <Input id="name" defaultValue="" />
      </>,
    );

    expect(screen.getByLabelText('Name')).toBeInstanceOf(HTMLInputElement);
  });

  it('carries the shared field-label look and merges a custom className', () => {
    render(<Label className="text-red-700">Name</Label>);

    expect(screen.getByText('Name')).toHaveClass(
      'mb-1.5',
      'block',
      'font-semibold',
      'text-red-700',
    );
  });

  it('forwards a ref to the underlying label element', () => {
    const ref = createRef<HTMLLabelElement>();
    render(<Label ref={ref}>Name</Label>);

    expect(ref.current).toBeInstanceOf(HTMLLabelElement);
  });

  it('has no accessibility violations when paired with its control', async () => {
    const { container } = render(
      <>
        <Label htmlFor="name">Name</Label>
        <Input id="name" defaultValue="" />
      </>,
    );

    expect(await axe(container)).toHaveNoViolations();
  });
});
