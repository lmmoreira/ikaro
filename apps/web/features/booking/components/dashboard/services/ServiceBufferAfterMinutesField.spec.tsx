// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWithIntl } from '@/test-utils';
import { ServiceBufferAfterMinutesField } from './ServiceBufferAfterMinutesField';

describe('ServiceBufferAfterMinutesField', () => {
  it('is enabled and editable when not disabled', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderWithIntl(
      <ServiceBufferAfterMinutesField value="15" disabled={false} onChange={onChange} />,
    );

    const input = screen.getByTestId('resource-buffer-input');
    expect(input).toBeEnabled();
    expect(input).toHaveValue(15);

    await user.type(input, '5');
    expect(onChange).toHaveBeenCalled();
  });

  it('is visibly disabled, not removed, when disabled is true', () => {
    renderWithIntl(<ServiceBufferAfterMinutesField value="15" disabled onChange={vi.fn()} />);

    const input = screen.getByTestId('resource-buffer-input');
    expect(input).toBeInTheDocument();
    expect(input).toBeDisabled();
    expect(input).toHaveValue(null);
  });
});
