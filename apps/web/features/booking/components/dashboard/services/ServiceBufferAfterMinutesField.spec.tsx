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
      <ServiceBufferAfterMinutesField
        value="15"
        disabled={false}
        tenantDefaultMinutes={60}
        invalid={false}
        onChange={onChange}
      />,
    );

    const input = screen.getByTestId('resource-buffer-input');
    expect(input).toBeEnabled();
    expect(input).toHaveValue(15);

    await user.type(input, '5');
    expect(onChange).toHaveBeenCalled();
  });

  it('is visibly disabled, not removed, when disabled is true', () => {
    renderWithIntl(
      <ServiceBufferAfterMinutesField
        value="15"
        disabled
        tenantDefaultMinutes={null}
        invalid={false}
        onChange={vi.fn()}
      />,
    );

    const input = screen.getByTestId('resource-buffer-input');
    expect(input).toBeInTheDocument();
    expect(input).toBeDisabled();
    expect(input).toHaveValue(null);
  });
  it('shows the business default as the placeholder and hint while blank', () => {
    renderWithIntl(
      <ServiceBufferAfterMinutesField
        value=""
        disabled={false}
        tenantDefaultMinutes={45}
        invalid={false}
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByTestId('resource-buffer-input')).toHaveAttribute(
      'placeholder',
      '45 (padrão da empresa)',
    );
    expect(screen.getByText(/usa o padrão da empresa, hoje 45 min/)).toBeInTheDocument();
  });

  it('shows no inheritance hint once a value (including 0) is typed', () => {
    renderWithIntl(
      <ServiceBufferAfterMinutesField
        value="0"
        disabled={false}
        tenantDefaultMinutes={45}
        invalid={false}
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByTestId('resource-buffer-input')).toHaveValue(0);
    expect(screen.queryByText(/usa o padrão da empresa, hoje/)).not.toBeInTheDocument();
  });

  it('flags an invalid value', () => {
    renderWithIntl(
      <ServiceBufferAfterMinutesField
        value="-1"
        disabled={false}
        tenantDefaultMinutes={45}
        invalid
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByTestId('resource-buffer-invalid')).toBeInTheDocument();
    expect(screen.getByTestId('resource-buffer-input')).toHaveAttribute('aria-invalid', 'true');
  });
});
