// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { ResourceStaffOptionItem } from '@ikaro/types';
import { renderWithIntl } from '@/test-utils';
import { ResourceIdentityFields } from './ResourceIdentityFields';

const STAFF_OPTIONS: ResourceStaffOptionItem[] = [
  { id: 's-1', email: 'camila@acme.com', name: 'Camila Duarte', isActive: true, isWrapped: false },
  { id: 's-2', email: 'bruno@acme.com', name: 'Bruno Alves', isActive: true, isWrapped: false },
];

function getTypeOption(type: 'STAFF' | 'ROOM' | 'EQUIPMENT') {
  const found = screen
    .getAllByTestId('resource-identity-type-option')
    .find((el) => el.getAttribute('data-type') === type);
  if (!found) throw new Error(`resource-identity-type-option with data-type="${type}" not found`);
  return found;
}

describe('ResourceIdentityFields', () => {
  it('shows the staff picker for type=STAFF and swaps to a name field for ROOM/EQUIPMENT', async () => {
    const user = userEvent.setup();
    const onTypeChange = vi.fn();
    const { rerender } = renderWithIntl(
      <ResourceIdentityFields
        showTypePicker
        type="STAFF"
        onTypeChange={onTypeChange}
        refId=""
        onRefIdChange={vi.fn()}
        name=""
        onNameChange={vi.fn()}
        staffOptions={STAFF_OPTIONS}
      />,
    );

    expect(screen.getByTestId('resource-identity-staff-select')).toBeInTheDocument();

    await user.click(getTypeOption('ROOM'));
    expect(onTypeChange).toHaveBeenCalledWith('ROOM');

    rerender(
      <ResourceIdentityFields
        showTypePicker
        type="ROOM"
        onTypeChange={onTypeChange}
        refId=""
        onRefIdChange={vi.fn()}
        name=""
        onNameChange={vi.fn()}
        staffOptions={STAFF_OPTIONS}
      />,
    );

    expect(screen.queryByTestId('resource-identity-staff-select')).not.toBeInTheDocument();
    expect(screen.getByTestId('resource-identity-name-input')).toBeInTheDocument();
  });

  it('disables an already-wrapped staff option', () => {
    const staffOptions: ResourceStaffOptionItem[] = [
      { ...STAFF_OPTIONS[0]!, isWrapped: true },
      STAFF_OPTIONS[1]!,
    ];
    renderWithIntl(
      <ResourceIdentityFields
        showTypePicker={false}
        type="STAFF"
        onTypeChange={vi.fn()}
        refId=""
        onRefIdChange={vi.fn()}
        name=""
        onNameChange={vi.fn()}
        staffOptions={staffOptions}
      />,
    );

    const option = screen.getByRole('option', { name: /Camila Duarte/ });
    expect(option).toBeDisabled();
  });

  it('excludes an inactive (deactivated) staff member from selectable options', () => {
    const staffOptions: ResourceStaffOptionItem[] = [
      ...STAFF_OPTIONS,
      { id: 's-3', email: 'ines@acme.com', name: 'Inês Souza', isActive: false, isWrapped: false },
    ];
    renderWithIntl(
      <ResourceIdentityFields
        showTypePicker={false}
        type="STAFF"
        onTypeChange={vi.fn()}
        refId=""
        onRefIdChange={vi.fn()}
        name=""
        onNameChange={vi.fn()}
        staffOptions={staffOptions}
      />,
    );

    expect(screen.queryByRole('option', { name: /Inês Souza/ })).not.toBeInTheDocument();
  });

  it('keeps the currently-selected staff option visible (disabled) even if it has since been deactivated', () => {
    const staffOptions: ResourceStaffOptionItem[] = [
      ...STAFF_OPTIONS,
      { id: 's-3', email: 'ines@acme.com', name: 'Inês Souza', isActive: false, isWrapped: false },
    ];
    renderWithIntl(
      <ResourceIdentityFields
        showTypePicker={false}
        type="STAFF"
        onTypeChange={vi.fn()}
        refId="s-3"
        onRefIdChange={vi.fn()}
        name=""
        onNameChange={vi.fn()}
        staffOptions={staffOptions}
      />,
    );

    const option = screen.getByRole('option', { name: /Inês Souza/ });
    expect(option).toBeDisabled();
  });

  it('hides the type picker when showTypePicker is false', () => {
    renderWithIntl(
      <ResourceIdentityFields
        showTypePicker={false}
        type="ROOM"
        onTypeChange={vi.fn()}
        refId=""
        onRefIdChange={vi.fn()}
        name=""
        onNameChange={vi.fn()}
        staffOptions={STAFF_OPTIONS}
      />,
    );

    expect(screen.queryByTestId('resource-identity-type-option')).not.toBeInTheDocument();
  });

  it('renders inline errors when provided', () => {
    renderWithIntl(
      <ResourceIdentityFields
        showTypePicker={false}
        type="ROOM"
        onTypeChange={vi.fn()}
        refId=""
        onRefIdChange={vi.fn()}
        name=""
        onNameChange={vi.fn()}
        staffOptions={STAFF_OPTIONS}
        nameError="Informe o nome."
      />,
    );

    expect(screen.getByText('Informe o nome.')).toBeInTheDocument();
  });
});
