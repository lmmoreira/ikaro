// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { axe } from '@/axe-helper';
import { Badge } from './badge';

describe('Badge', () => {
  it('keeps the default look when no variant or size is given', () => {
    render(<Badge>Novo</Badge>);

    expect(screen.getByText('Novo')).toHaveClass(
      'inline-flex',
      'rounded-full',
      'border',
      'px-2.5',
      'py-0.5',
      'text-xs',
      'font-semibold',
      'border-transparent',
      'bg-primary',
      'text-primary-foreground',
    );
  });

  it.each([
    ['secondary', ['bg-secondary', 'text-secondary-foreground']],
    ['destructive', ['bg-destructive', 'text-destructive-foreground']],
    ['outline', ['text-foreground']],
  ] as const)('keeps the existing %s variant unchanged', (variant, classes) => {
    render(<Badge variant={variant}>Chip</Badge>);

    expect(screen.getByText('Chip')).toHaveClass(...classes);
  });

  it.each([
    ['neutral', ['bg-gray-100', 'text-gray-600']],
    ['info', ['bg-blue-100', 'text-blue-800']],
    ['success', ['bg-green-100', 'text-green-800']],
    ['warning', ['bg-orange-100', 'text-orange-800']],
  ] as const)('renders the %s tone borderless', (variant, classes) => {
    render(<Badge variant={variant}>Chip</Badge>);

    const badge = screen.getByText('Chip');
    expect(badge).toHaveClass('border-0', ...classes);
    expect(badge).not.toHaveClass('border');
  });

  it('renders the small size with the compact font size instead of text-xs', () => {
    render(
      <Badge variant="neutral" size="sm">
        Chip
      </Badge>,
    );

    const badge = screen.getByText('Chip');
    expect(badge).toHaveClass('text-[0.6875rem]');
    expect(badge).not.toHaveClass('text-xs');
  });

  it('lets a caller className override a tone colour', () => {
    render(
      <Badge variant="info" className="bg-teal-100 text-teal-800">
        Chip
      </Badge>,
    );

    const badge = screen.getByText('Chip');
    expect(badge).toHaveClass('bg-teal-100', 'text-teal-800');
    expect(badge).not.toHaveClass('bg-blue-100');
  });

  it('forwards native props', () => {
    render(<Badge data-testid="the-badge">Chip</Badge>);

    expect(screen.getByTestId('the-badge')).toBeInTheDocument();
  });

  it('has no accessibility violations', async () => {
    const { container } = render(<Badge variant="success">Aprovado</Badge>);

    expect(await axe(container)).toHaveNoViolations();
  });
});
