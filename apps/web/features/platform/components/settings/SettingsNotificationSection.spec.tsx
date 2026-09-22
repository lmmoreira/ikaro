// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWithIntl } from '@/test-utils';
import { SettingsNotificationSection } from './SettingsNotificationSection';

describe('SettingsNotificationSection', () => {
  it('renders the from-email field and calls onChange', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderWithIntl(
      <SettingsNotificationSection
        notificationFromEmail=""
        notificationFromEmailError={undefined}
        onChange={onChange}
      />,
    );

    await user.type(screen.getByTestId('settings-notification-from-email'), 'x');
    expect(onChange).toHaveBeenCalledWith('x');
  });

  it('renders the error message when present', () => {
    renderWithIntl(
      <SettingsNotificationSection
        notificationFromEmail=""
        notificationFromEmailError="E-mail inválido"
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByText('E-mail inválido')).toBeInTheDocument();
  });
});
