// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PickerNotice } from './PickerNotice';

describe('PickerNotice', () => {
  it.each([['dashboard' as const], ['hotsite' as const]])(
    'announces the message as an alert without a retry (%s)',
    (variant) => {
      render(<PickerNotice message="Sem horários" variant={variant} />);

      expect(screen.getByRole('alert')).toHaveTextContent('Sem horários');
      expect(screen.queryByRole('button')).toBeNull();
    },
  );

  it('uses the shared feedback message on the dashboard look and the branded one on the hotsite', () => {
    const { container, rerender } = render(<PickerNotice message="x" variant="dashboard" />);
    expect(container.querySelector('.border-red-300.bg-red-50')).not.toBeNull();
    expect(container.querySelector('[style*="--ba-radius"]')).toBeNull();

    rerender(<PickerNotice message="x" variant="hotsite" />);
    expect(container.querySelector('[style*="--ba-radius"]')).not.toBeNull();
  });
});
