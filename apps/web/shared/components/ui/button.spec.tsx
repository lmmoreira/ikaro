// @vitest-environment jsdom
import { createRef } from 'react';
import Link from 'next/link';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { axe } from '@/axe-helper';
import { Button } from './button';

describe('Button', () => {
  it('keeps the default look when no variant or size is given', () => {
    render(<Button>Salvar</Button>);

    expect(screen.getByRole('button', { name: 'Salvar' })).toHaveClass(
      'bg-primary',
      'text-primary-foreground',
      'shadow-sm',
      'h-9',
      'px-4',
    );
  });

  it.each([
    ['destructive', ['bg-destructive', 'text-destructive-foreground']],
    ['outline', ['border', 'border-border', 'bg-background', 'hover:bg-muted']],
    ['secondary', ['bg-secondary', 'text-secondary-foreground']],
    ['ghost', ['text-primary', 'hover:bg-accent']],
    ['link', ['text-primary', 'underline-offset-4']],
  ] as const)('keeps the existing %s variant unchanged', (variant, classes) => {
    render(<Button variant={variant}>Ação</Button>);

    expect(screen.getByRole('button', { name: 'Ação' })).toHaveClass(...classes);
  });

  it('renders the surface variant as a white borderless button', () => {
    render(<Button variant="surface">Voltar</Button>);

    const button = screen.getByRole('button', { name: 'Voltar' });
    expect(button).toHaveClass(
      'border-0',
      'bg-white',
      'text-gray-900',
      'shadow-sm',
      'hover:bg-gray-50',
    );
    expect(button).not.toHaveClass('bg-primary');
  });

  it('renders the destructive-outline variant with a red border and red text that stays red on hover', () => {
    render(<Button variant="destructive-outline">Rejeitar</Button>);

    const button = screen.getByRole('button', { name: 'Rejeitar' });
    expect(button).toHaveClass(
      'border',
      'border-red-200',
      'text-red-700',
      'hover:bg-red-50',
      'hover:text-red-700',
    );
    expect(button).not.toHaveClass('hover:text-foreground');
  });

  it('lets a caller className add width next to a variant', () => {
    render(
      <Button variant="surface" className="w-full">
        Voltar
      </Button>,
    );

    expect(screen.getByRole('button', { name: 'Voltar' })).toHaveClass('w-full', 'bg-white');
  });

  it('renders the child element instead of a button when asChild is set', () => {
    render(
      <Button asChild variant="surface">
        <Link href="/voltar">Voltar</Link>
      </Button>,
    );

    const link = screen.getByRole('link', { name: 'Voltar' });
    expect(link).toHaveClass('bg-white');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('calls onClick and respects disabled', async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    const { rerender } = render(<Button onClick={onClick}>Ir</Button>);

    await user.click(screen.getByRole('button', { name: 'Ir' }));
    expect(onClick).toHaveBeenCalledTimes(1);

    rerender(
      <Button onClick={onClick} disabled>
        Ir
      </Button>,
    );
    await user.click(screen.getByRole('button', { name: 'Ir' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('forwards a ref to the underlying button', () => {
    const ref = createRef<HTMLButtonElement>();
    render(<Button ref={ref}>Ir</Button>);

    expect(ref.current).toBeInstanceOf(HTMLButtonElement);
  });

  it('has no accessibility violations for the new variants', async () => {
    const { container } = render(
      <>
        <Button variant="surface">Voltar</Button>
        <Button variant="destructive-outline">Rejeitar</Button>
      </>,
    );

    expect(await axe(container)).toHaveNoViolations();
  });
});
