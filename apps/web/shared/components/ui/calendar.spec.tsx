// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithIntl } from '@/test-utils';
import { Calendar } from './calendar';

describe('Calendar', () => {
  it('renders localized month text', () => {
    renderWithIntl(
      <Calendar mode="single" month={new Date(2026, 6, 1)} selected={new Date(2026, 6, 13)} />,
    );

    expect(screen.getByText(/julho 2026/i)).toBeInTheDocument();
  });

  it('renders selected days with white text', () => {
    const { container } = renderWithIntl(
      <Calendar mode="single" month={new Date(2026, 6, 1)} selected={new Date(2026, 6, 13)} />,
    );

    expect(container.querySelector('[data-day="2026-07-13"][data-selected="true"]')).toHaveClass(
      'text-white',
    );
  });
});
