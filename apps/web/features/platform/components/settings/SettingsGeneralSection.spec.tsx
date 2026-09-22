// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWithIntl } from '@/test-utils';
import { SettingsGeneralSection } from './SettingsGeneralSection';

describe('SettingsGeneralSection', () => {
  it('renders the name field and the read-only slug', () => {
    renderWithIntl(
      <SettingsGeneralSection
        slug="beloauto"
        name="BeloAuto"
        nameError={undefined}
        onNameChange={vi.fn()}
      />,
    );

    expect(screen.getByTestId('settings-name')).toHaveValue('BeloAuto');
    const slugInput = screen.getByTestId('settings-slug-input');
    expect(slugInput).toHaveValue('beloauto');
    expect(slugInput).toBeDisabled();
  });

  it('calls onNameChange when the name field changes', async () => {
    const user = userEvent.setup();
    const onNameChange = vi.fn();
    renderWithIntl(
      <SettingsGeneralSection
        slug="beloauto"
        name="BeloAuto"
        nameError={undefined}
        onNameChange={onNameChange}
      />,
    );

    await user.type(screen.getByTestId('settings-name'), 'X');
    expect(onNameChange).toHaveBeenCalledWith('BeloAutoX');
  });

  it('renders the name error when present', () => {
    renderWithIntl(
      <SettingsGeneralSection
        slug="beloauto"
        name="BeloAuto"
        nameError="Nome inválido"
        onNameChange={vi.fn()}
      />,
    );

    expect(screen.getByText('Nome inválido')).toBeInTheDocument();
  });
});
