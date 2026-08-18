// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithIntl } from '@/test-utils';
import { SettingsLocalizationSection } from './SettingsLocalizationSection';

describe('SettingsLocalizationSection', () => {
  it('renders the read-only country, currency, and language values', () => {
    renderWithIntl(
      <SettingsLocalizationSection countryCode="BR" currency="BRL" language="pt-BR" />,
    );

    expect(screen.getByTestId('settings-country-code')).toHaveTextContent('BR');
    expect(screen.getByTestId('settings-currency')).toHaveTextContent('BRL');
    expect(screen.getByTestId('settings-language')).toHaveTextContent('pt-BR');
  });
});
