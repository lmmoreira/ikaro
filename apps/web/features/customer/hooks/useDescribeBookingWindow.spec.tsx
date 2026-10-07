// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithIntl } from '@/test-utils';
import { useDescribeBookingWindow } from './useDescribeBookingWindow';

function Probe(): React.JSX.Element {
  const describeWindow = useDescribeBookingWindow();

  return (
    <p data-testid="described">
      {describeWindow({
        start: new Date('2030-06-20T13:00:00.000Z'),
        end: new Date('2030-06-20T14:30:00.000Z'),
      })}
    </p>
  );
}

describe('useDescribeBookingWindow', () => {
  it('describes a window as the long date followed by the start and end time in the tenant timezone', () => {
    renderWithIntl(<Probe />);

    expect(screen.getByTestId('described')).toHaveTextContent(/ · 10:00–11:30$/);
  });
});
