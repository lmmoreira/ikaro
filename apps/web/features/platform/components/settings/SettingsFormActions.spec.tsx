// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithIntl } from '@/test-utils';
import { SettingsDesktopActions, SettingsMobileActionBar } from './SettingsFormActions';

describe('SettingsFormActions', () => {
  it('SettingsDesktopActions shows the submit label and disables while submitting', () => {
    const { rerender } = renderWithIntl(<SettingsDesktopActions isSubmitting={false} />);
    const button = screen.getByTestId('settings-submit-desktop');
    expect(button).not.toBeDisabled();

    rerender(<SettingsDesktopActions isSubmitting />);
    expect(screen.getByTestId('settings-submit-desktop')).toBeDisabled();
  });

  it('SettingsMobileActionBar shows the submit label and disables while submitting', () => {
    const { rerender } = renderWithIntl(<SettingsMobileActionBar isSubmitting={false} />);
    const button = screen.getByTestId('settings-submit-mobile');
    expect(button).not.toBeDisabled();

    rerender(<SettingsMobileActionBar isSubmitting />);
    expect(screen.getByTestId('settings-submit-mobile')).toBeDisabled();
  });
});
