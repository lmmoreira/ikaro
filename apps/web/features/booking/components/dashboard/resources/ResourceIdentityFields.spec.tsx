// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ResourceStaffOptionItem } from '@ikaro/types';
import { renderWithIntl } from '@/test-utils';
import { useFormFeedback } from '@/shared/lib/feedback/use-form-feedback';
import { ResourceIdentityFields } from './ResourceIdentityFields';

const STAFF_OPTIONS: ResourceStaffOptionItem[] = [
  { id: 's-1', email: 'camila@acme.com', name: 'Camila Duarte', isActive: true, isWrapped: false },
  { id: 's-2', email: 'bruno@acme.com', name: 'Bruno Alves', isActive: true, isWrapped: false },
];

type FieldsProps = Omit<Parameters<typeof ResourceIdentityFields>[0], 'feedback'> & {
  readonly errors?: Record<string, string>;
};

// Wires the real hook the parent form owns, so the spec exercises the same field marking.
function Fields({ errors, ...props }: FieldsProps): React.JSX.Element {
  const feedback = useFormFeedback();
  const { setFieldErrors } = feedback;
  useEffect(() => {
    if (errors) setFieldErrors(errors);
  }, [errors, setFieldErrors]);
  return <ResourceIdentityFields {...props} feedback={feedback} />;
}

function getTypeOption(type: 'STAFF' | 'ROOM' | 'EQUIPMENT') {
  const found = screen
    .getAllByTestId('resource-identity-type-option')
    .find((el) => el.getAttribute('data-type') === type);
  if (!found) throw new Error(`resource-identity-type-option with data-type="${type}" not found`);
  return found;
}

const NAME_REQUIRED = { name: 'Informe o nome.' };
const STAFF_AND_NAME_REQUIRED = { refId: 'Selecione um profissional.', name: 'Informe o nome.' };

const scrollIntoView = vi.fn();

describe('ResourceIdentityFields', () => {
  beforeEach(() => {
    // jsdom has no scrollIntoView; the hook calls it before focusing the first invalid field.
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: scrollIntoView,
    });
  });

  afterEach(() => {
    scrollIntoView.mockClear();
  });

  it.each(['STAFF', 'ROOM'] as const)(
    'gives every %s control an accessible name through its label',
    (type) => {
      renderWithIntl(
        <Fields
          showTypePicker={false}
          type={type}
          onTypeChange={vi.fn()}
          refId=""
          onRefIdChange={vi.fn()}
          name=""
          onNameChange={vi.fn()}
          staffOptions={STAFF_OPTIONS}
        />,
      );

      expect(screen.getByTestId('resource-identity-name-input')).toHaveAccessibleName(/\S/);
      if (type === 'STAFF') {
        expect(screen.getByTestId('resource-identity-staff-select')).toHaveAccessibleName(/\S/);
      }
    },
  );

  it('shows the staff picker for type=STAFF and swaps to a name field for ROOM/EQUIPMENT', async () => {
    const user = userEvent.setup();
    const onTypeChange = vi.fn();
    const { rerender } = renderWithIntl(
      <Fields
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
      <Fields
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
      <Fields
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
      <Fields
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
      <Fields
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
      <Fields
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
      <Fields
        showTypePicker={false}
        type="ROOM"
        onTypeChange={vi.fn()}
        refId=""
        onRefIdChange={vi.fn()}
        name=""
        onNameChange={vi.fn()}
        staffOptions={STAFF_OPTIONS}
        errors={NAME_REQUIRED}
      />,
    );

    expect(screen.getByText('Informe o nome.')).toBeInTheDocument();
  });

  it('marks the name input invalid, describes it by its message and focuses it', () => {
    renderWithIntl(
      <Fields
        showTypePicker={false}
        type="ROOM"
        onTypeChange={vi.fn()}
        refId=""
        onRefIdChange={vi.fn()}
        name=""
        onNameChange={vi.fn()}
        staffOptions={STAFF_OPTIONS}
        errors={NAME_REQUIRED}
      />,
    );

    const input = screen.getByTestId('resource-identity-name-input');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription(expect.stringContaining('Informe o nome.'));
    expect(input).toHaveFocus();
    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'center' });
  });

  it('marks the staff select invalid and focuses the first invalid field in document order', () => {
    renderWithIntl(
      <Fields
        showTypePicker
        type="STAFF"
        onTypeChange={vi.fn()}
        refId=""
        onRefIdChange={vi.fn()}
        name=""
        onNameChange={vi.fn()}
        staffOptions={STAFF_OPTIONS}
        errors={STAFF_AND_NAME_REQUIRED}
      />,
    );

    const select = screen.getByTestId('resource-identity-staff-select');
    expect(select).toHaveAttribute('aria-invalid', 'true');
    expect(select).toHaveFocus();
    expect(screen.getByTestId('resource-identity-name-input')).toHaveAttribute(
      'aria-invalid',
      'true',
    );
  });

  it('leaves valid fields unmarked', () => {
    renderWithIntl(
      <Fields
        showTypePicker={false}
        type="ROOM"
        onTypeChange={vi.fn()}
        refId=""
        onRefIdChange={vi.fn()}
        name="Sala"
        onNameChange={vi.fn()}
        staffOptions={STAFF_OPTIONS}
      />,
    );

    expect(screen.getByTestId('resource-identity-name-input')).not.toHaveAttribute('aria-invalid');
  });
});
