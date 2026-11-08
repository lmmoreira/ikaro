// @vitest-environment jsdom
import { fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { renderWithIntl } from '@/test-utils';
import { useFormFeedback } from '@/shared/lib/feedback/use-form-feedback';
import { GuestContactForm } from './GuestContactForm';

const EMPTY = { contactName: '', contactPhone: '', contactEmail: '' };

beforeAll(() => {
  // jsdom has no scrollIntoView; the hook scrolls the first invalid field into view
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
    configurable: true,
    value: vi.fn(),
  });
});

function Harness({
  onChange = vi.fn(),
  invalid,
}: {
  readonly onChange?: (value: typeof EMPTY) => void;
  readonly invalid?: 'name' | 'phone' | 'email';
}): React.JSX.Element {
  const feedback = useFormFeedback();
  return (
    <>
      <GuestContactForm value={EMPTY} phonePrefix="+55" feedback={feedback} onChange={onChange} />
      <button
        type="button"
        data-testid="validate"
        onClick={() => invalid && feedback.setFieldErrors({ [invalid]: 'Informe o contato.' })}
      >
        validate
      </button>
    </>
  );
}

describe('GuestContactForm', () => {
  it('reports each typed field, keeping the others', () => {
    const onChange = vi.fn();
    renderWithIntl(<Harness onChange={onChange} />);

    fireEvent.change(screen.getByTestId('guest-name'), { target: { value: 'Maria' } });
    expect(onChange).toHaveBeenLastCalledWith({ ...EMPTY, contactName: 'Maria' });

    fireEvent.change(screen.getByTestId('guest-email'), { target: { value: 'm@x.com' } });
    expect(onChange).toHaveBeenLastCalledWith({ ...EMPTY, contactEmail: 'm@x.com' });
  });

  it('keeps the phone in international form, prefixed by the tenant’s country', () => {
    const onChange = vi.fn();
    renderWithIntl(<Harness onChange={onChange} />);

    fireEvent.change(screen.getByTestId('guest-phone'), { target: { value: '31999990000' } });

    expect(onChange).toHaveBeenLastCalledWith({ ...EMPTY, contactPhone: '+5531999990000' });
    expect(screen.getByText('+55')).toBeInTheDocument();
  });

  it('shows no error and marks no field while the form is valid', () => {
    renderWithIntl(<Harness />);

    expect(screen.queryByTestId('guest-error')).not.toBeInTheDocument();
    for (const id of ['guest-name', 'guest-phone', 'guest-email']) {
      expect(screen.getByTestId(id)).not.toHaveAttribute('aria-invalid');
      expect(screen.getByTestId(id).className).not.toContain('border-red-600');
    }
  });

  it.each([
    ['name', 'guest-name'],
    ['phone', 'guest-phone'],
    ['email', 'guest-email'],
  ] as const)(
    'marks, links and focuses the %s field that failed validation, and only that one',
    async (field, testId) => {
      renderWithIntl(<Harness invalid={field} />);

      await userEvent.click(screen.getByTestId('validate'));

      const input = screen.getByTestId(testId);
      const message = screen.getByTestId('guest-error');
      expect(input).toHaveAttribute('aria-invalid', 'true');
      expect(input.className).toContain('border-red-600');
      expect(input).toHaveFocus();
      expect(message).toHaveTextContent('Informe o contato.');
      // a field message has no role; the input reaches it through aria-describedby
      expect(message).not.toHaveAttribute('role');
      expect(input).toHaveAccessibleDescription('Informe o contato.');
      expect(screen.getAllByTestId('guest-error')).toHaveLength(1);
      const others = ['guest-name', 'guest-phone', 'guest-email'].filter((id) => id !== testId);
      for (const id of others) {
        expect(screen.getByTestId(id)).not.toHaveAttribute('aria-invalid');
        expect(screen.getByTestId(id)).not.toHaveAttribute('aria-describedby');
      }
    },
  );

  it('says the booking is recorded as a guest booking', () => {
    renderWithIntl(<Harness />);

    expect(screen.getByText(/reserva de convidado/)).toBeInTheDocument();
  });
});
