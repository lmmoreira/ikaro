// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  AvailabilityAlertListError,
  AvailabilityAlertListSkeleton,
} from './AvailabilityAlertListStates';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

describe('AvailabilityAlertListSkeleton', () => {
  it('shows the title and the loading message', () => {
    render(<AvailabilityAlertListSkeleton />);

    expect(screen.getByTestId('alerts-loading')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('loading');
  });
});

describe('AvailabilityAlertListError', () => {
  it('announces the failure and retries on "Tentar novamente"', () => {
    const onRetry = vi.fn();
    render(<AvailabilityAlertListError onRetry={onRetry} />);

    expect(screen.getByRole('alert')).toHaveTextContent('loadErrorTitle');

    fireEvent.click(screen.getByRole('button', { name: 'retry' }));

    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
