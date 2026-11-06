// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { CalendarDays } from 'lucide-react';
import Link from 'next/link';
import { describe, expect, it } from 'vitest';
import { axe } from '@/axe-helper';
import { EmptyState } from './empty-state';

const icon = <CalendarDays className="h-10 w-10 text-gray-300" aria-hidden="true" />;

describe('EmptyState', () => {
  it('renders the icon, title and body inside the card', () => {
    render(<EmptyState icon={icon} title="No bookings yet" body="Book your first visit." />);

    expect(screen.getByText('No bookings yet')).toHaveClass('text-base', 'font-semibold');
    expect(screen.getByText('Book your first visit.')).toHaveClass('max-w-sm', 'text-sm');
    expect(document.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByText('No bookings yet').closest('section')).toHaveClass(
      'rounded-2xl',
      'border-gray-100',
      'bg-white',
      'text-center',
    );
  });

  it('renders the action slot when given one', () => {
    render(
      <EmptyState
        icon={icon}
        title="No bookings yet"
        body="Book your first visit."
        action={<Link href="/book">Book now</Link>}
      />,
    );

    expect(screen.getByRole('link', { name: 'Book now' })).toHaveAttribute('href', '/book');
  });

  it('omits the action slot when none is given', () => {
    render(<EmptyState icon={icon} title="No bookings yet" body="Book your first visit." />);

    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('forwards data-testid and merges a custom className', () => {
    render(
      <EmptyState
        icon={icon}
        title="No bookings yet"
        body="Book your first visit."
        data-testid="empty"
        className="mt-6"
      />,
    );

    expect(screen.getByTestId('empty')).toHaveClass('mt-6', 'rounded-2xl', 'py-12');
  });

  it('has no accessibility violations', async () => {
    const { container } = render(
      <EmptyState
        icon={icon}
        title="No bookings yet"
        body="Book your first visit."
        action={<Link href="/book">Book now</Link>}
      />,
    );

    expect(await axe(container)).toHaveNoViolations();
  });
});
