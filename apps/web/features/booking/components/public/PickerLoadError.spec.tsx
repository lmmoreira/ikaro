// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { PickerLoadError } from './PickerLoadError';

describe('PickerLoadError', () => {
  it.each([['dashboard' as const], ['hotsite' as const]])(
    'shows the message as an alert with a working retry (%s)',
    async (variant) => {
      const onRetry = vi.fn();
      render(
        <PickerLoadError
          message="Não foi possível carregar"
          onRetry={onRetry}
          retryLabel="Tentar novamente"
          variant={variant}
        />,
      );

      expect(screen.getByRole('alert')).toHaveTextContent('Não foi possível carregar');
      await userEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
      expect(onRetry).toHaveBeenCalledTimes(1);
    },
  );

  it('uses the shared feedback message on the dashboard look and the branded message on the hotsite', () => {
    const { container, rerender } = render(
      <PickerLoadError message="x" onRetry={vi.fn()} retryLabel="r" variant="dashboard" />,
    );
    expect(container.querySelector('.border-red-300.bg-red-50.rounded-lg')).not.toBeNull();
    expect(container.querySelector('[style*="--ba-radius"]')).toBeNull();

    rerender(<PickerLoadError message="x" onRetry={vi.fn()} retryLabel="r" variant="hotsite" />);
    expect(container.querySelector('.rounded-lg')).toBeNull();
    expect(container.querySelector('[style*="--ba-radius"]')).not.toBeNull();
  });
});
