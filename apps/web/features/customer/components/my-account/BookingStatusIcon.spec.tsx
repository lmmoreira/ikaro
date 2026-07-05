// @vitest-environment jsdom
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BookingStatusIcon } from './BookingStatusIcon';

describe('BookingStatusIcon', () => {
  it('renders a blue square for APPROVED', () => {
    const { container } = render(<BookingStatusIcon status="APPROVED" />);
    expect(container.querySelector('.bg-blue-50')).toBeInTheDocument();
    expect(container.querySelector('.text-blue-600')).toBeInTheDocument();
  });

  it('renders a blue square for PENDING', () => {
    const { container } = render(<BookingStatusIcon status="PENDING" />);
    expect(container.querySelector('.bg-blue-50')).toBeInTheDocument();
  });

  it('renders a darker blue square for INFO_REQUESTED', () => {
    const { container } = render(<BookingStatusIcon status="INFO_REQUESTED" />);
    expect(container.querySelector('.bg-blue-100')).toBeInTheDocument();
    expect(container.querySelector('.text-blue-700')).toBeInTheDocument();
  });

  it('renders a green square for COMPLETED', () => {
    const { container } = render(<BookingStatusIcon status="COMPLETED" />);
    expect(container.querySelector('.bg-green-50')).toBeInTheDocument();
    expect(container.querySelector('.text-green-600')).toBeInTheDocument();
  });

  it('renders a red square for CANCELLED and REJECTED', () => {
    const cancelled = render(<BookingStatusIcon status="CANCELLED" />);
    expect(cancelled.container.querySelector('.bg-red-50')).toBeInTheDocument();
    expect(cancelled.container.querySelector('.text-red-600')).toBeInTheDocument();
    const rejected = render(<BookingStatusIcon status="REJECTED" />);
    expect(rejected.container.querySelector('.bg-red-50')).toBeInTheDocument();
    expect(rejected.container.querySelector('.text-red-600')).toBeInTheDocument();
  });
});
