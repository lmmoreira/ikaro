// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { axe } from '@/axe-helper';
import { PageHeader } from './page-header';

describe('PageHeader', () => {
  it('renders the title as the only level-one heading', () => {
    render(<PageHeader title="My bookings" />);

    const heading = screen.getByRole('heading', { level: 1, name: 'My bookings' });
    expect(heading).toHaveClass('text-lg', 'font-bold', 'text-gray-900');
    expect(heading).not.toHaveClass('mt-1');
  });

  it('draws the eyebrow with SectionLabel above the title', () => {
    render(<PageHeader eyebrow="Step 1" title="Pattern" />);

    const eyebrow = screen.getByText('Step 1');
    expect(eyebrow).toHaveClass('uppercase', 'tracking-[0.07em]', 'text-gray-500');
    expect(screen.getByRole('heading', { level: 1 })).toHaveClass('mt-1');
    expect(
      eyebrow.compareDocumentPosition(screen.getByRole('heading', { level: 1 })) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('renders the description under the title only when given one', () => {
    const { rerender } = render(<PageHeader title="Weekly" description="Every Monday" />);

    expect(screen.getByText('Every Monday')).toHaveClass('text-sm', 'text-gray-500');

    rerender(<PageHeader title="Weekly" />);

    expect(screen.queryByText('Every Monday')).not.toBeInTheDocument();
  });

  it('renders the actions slot beside the title block only when given one', () => {
    const { rerender } = render(
      <PageHeader title="Weekly" actions={<span data-testid="header-action">Active</span>} />,
    );

    expect(screen.getByTestId('header-action')).toHaveTextContent('Active');

    rerender(<PageHeader title="Weekly" />);

    expect(screen.queryByTestId('header-action')).not.toBeInTheDocument();
  });

  it('merges a caller className and passes the root props through', () => {
    render(<PageHeader title="Weekly" className="items-center" data-testid="header" />);

    expect(screen.getByTestId('header')).toHaveClass('flex', 'items-center', 'justify-between');
    expect(screen.getByTestId('header')).not.toHaveClass('items-start');
  });

  it('has no axe violations with every slot filled', async () => {
    const { container } = render(
      <main>
        <PageHeader
          eyebrow="Step 1"
          title="Pattern"
          description="Pick the days"
          actions={<button type="button">New</button>}
        />
      </main>,
    );

    expect(await axe(container)).toHaveNoViolations();
  });
});
