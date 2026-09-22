// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWithIntl } from '@/test-utils';
import { ServicePickupSwitch } from './ServicePickupSwitch';

describe('ServicePickupSwitch', () => {
  it('reflects checked=false via aria-checked', () => {
    renderWithIntl(<ServicePickupSwitch checked={false} onToggle={vi.fn()} />);

    expect(screen.getByTestId('service-pickup-switch')).toHaveAttribute('aria-checked', 'false');
  });

  it('reflects checked=true via aria-checked', () => {
    renderWithIntl(<ServicePickupSwitch checked onToggle={vi.fn()} />);

    expect(screen.getByTestId('service-pickup-switch')).toHaveAttribute('aria-checked', 'true');
  });

  it('calls onToggle when clicked', async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    renderWithIntl(<ServicePickupSwitch checked={false} onToggle={onToggle} />);

    await user.click(screen.getByTestId('service-pickup-switch'));

    expect(onToggle).toHaveBeenCalledTimes(1);
  });
});
