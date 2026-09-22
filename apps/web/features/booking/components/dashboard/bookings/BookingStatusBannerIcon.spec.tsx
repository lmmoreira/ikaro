// @vitest-environment jsdom
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BookingStatusBannerIcon } from './BookingStatusBannerIcon';

describe('BookingStatusBannerIcon', () => {
  it('renders a green background for the success variant', () => {
    const { container } = render(<BookingStatusBannerIcon variant="success" />);

    expect(container.querySelector('.bg-green-600')).not.toBeNull();
    expect(container.querySelector('polyline')).not.toBeNull();
  });

  it('renders a red background with an X icon for the danger variant', () => {
    const { container } = render(<BookingStatusBannerIcon variant="danger" />);

    expect(container.querySelector('.bg-red-600')).not.toBeNull();
    expect(container.querySelectorAll('line')).toHaveLength(2);
  });

  it('renders a blue background with an info icon for the info variant', () => {
    const { container } = render(<BookingStatusBannerIcon variant="info" />);

    expect(container.querySelector('.bg-blue-600')).not.toBeNull();
    expect(container.querySelector('circle')).not.toBeNull();
  });
});
