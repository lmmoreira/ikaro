// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { FloatingCreateButton } from './floating-create-button';

describe('FloatingCreateButton', () => {
  it('is a link to the create route, named by its label', () => {
    render(<FloatingCreateButton href="/dashboard/resources/new" label="Novo recurso" />);

    expect(screen.getByRole('link', { name: 'Novo recurso' })).toHaveAttribute(
      'href',
      '/dashboard/resources/new',
    );
  });

  it('floats over the viewport on mobile and is hidden from the large layout', () => {
    render(<FloatingCreateButton href="/dashboard/resources/new" label="Novo recurso" />);

    const link = screen.getByRole('link', { name: 'Novo recurso' });
    expect(link).toHaveClass('fixed', 'bottom-20', 'right-6', 'lg:hidden');
  });

  it('hides the plus icon from assistive technology', () => {
    render(<FloatingCreateButton href="/dashboard/resources/new" label="Novo recurso" />);

    expect(screen.getByRole('link', { name: 'Novo recurso' }).querySelector('svg')).toHaveAttribute(
      'aria-hidden',
      'true',
    );
  });
});
