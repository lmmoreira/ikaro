// @vitest-environment jsdom
import { fireEvent, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithIntl } from '@/test-utils';
import { GuestContactForm } from './GuestContactForm';

const EMPTY = { contactName: '', contactPhone: '', contactEmail: '' };

describe('GuestContactForm', () => {
  it('reports each typed field, keeping the others', () => {
    const onChange = vi.fn();
    renderWithIntl(
      <GuestContactForm value={EMPTY} phonePrefix="+55" errorField={null} onChange={onChange} />,
    );

    fireEvent.change(screen.getByTestId('guest-name'), { target: { value: 'Maria' } });
    expect(onChange).toHaveBeenLastCalledWith({ ...EMPTY, contactName: 'Maria' });

    fireEvent.change(screen.getByTestId('guest-email'), { target: { value: 'm@x.com' } });
    expect(onChange).toHaveBeenLastCalledWith({ ...EMPTY, contactEmail: 'm@x.com' });
  });

  it('keeps the phone in international form, prefixed by the tenant’s country', () => {
    const onChange = vi.fn();
    renderWithIntl(
      <GuestContactForm value={EMPTY} phonePrefix="+55" errorField={null} onChange={onChange} />,
    );

    fireEvent.change(screen.getByTestId('guest-phone'), { target: { value: '31999990000' } });

    expect(onChange).toHaveBeenLastCalledWith({ ...EMPTY, contactPhone: '+5531999990000' });
    expect(screen.getByText('+55')).toBeInTheDocument();
  });

  it('flags the field that failed validation, and only that one', () => {
    renderWithIntl(
      <GuestContactForm value={EMPTY} phonePrefix="+55" errorField="email" onChange={vi.fn()} />,
    );

    expect(screen.getByTestId('guest-email')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByTestId('guest-name')).not.toHaveAttribute('aria-invalid');
    expect(screen.getByTestId('guest-error')).toHaveTextContent(
      'Nome, telefone e e-mail são obrigatórios.',
    );
  });

  it('says the booking is recorded as a guest booking', () => {
    renderWithIntl(
      <GuestContactForm value={EMPTY} phonePrefix="+55" errorField={null} onChange={vi.fn()} />,
    );

    expect(screen.getByText(/reserva de convidado/)).toBeInTheDocument();
  });
});
