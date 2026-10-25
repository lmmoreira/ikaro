// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { getPillOption, renderWithIntl } from '@/test-utils';
import { NavigationCtaFields } from './NavigationCtaFields';

const CTA = { label: 'Agendar', target: 'booking-form' } as const;

function renderFields(
  cta: Parameters<typeof NavigationCtaFields>[0]['cta'],
  leadFormEnabled = true,
) {
  const onChange = vi.fn();
  renderWithIntl(
    <NavigationCtaFields cta={cta} leadFormEnabled={leadFormEnabled} onChange={onChange} />,
  );
  return onChange;
}

describe('NavigationCtaFields', () => {
  it('is off when there is no button, and shows no fields', () => {
    renderFields(undefined);

    expect(screen.getByTestId('navigation-cta-toggle')).toHaveAttribute('aria-checked', 'false');
    expect(screen.queryByLabelText('Texto do botão')).not.toBeInTheDocument();
  });

  it('turning it on seeds a booking button; turning it off removes it', async () => {
    const user = userEvent.setup();
    const turnedOn = renderFields(undefined);
    await user.click(screen.getByTestId('navigation-cta-toggle'));
    expect(turnedOn).toHaveBeenLastCalledWith({ label: '', target: 'booking-form' });
  });

  it('turning it off reports no button', async () => {
    const user = userEvent.setup();
    const onChange = renderFields(CTA);

    await user.click(screen.getByTestId('navigation-cta-toggle'));

    expect(onChange).toHaveBeenLastCalledWith(undefined);
  });

  it('edits the label within the 30-character bound, and the target', async () => {
    const user = userEvent.setup();
    const onChange = renderFields(CTA);

    expect(screen.getByLabelText('Texto do botão')).toHaveAttribute('maxlength', '30');
    await user.type(screen.getByLabelText('Texto do botão'), '!');
    expect(onChange).toHaveBeenLastCalledWith({ ...CTA, label: 'Agendar!' });

    await user.click(getPillOption('navigation-cta-target', 'lead-form'));
    expect(onChange).toHaveBeenLastCalledWith({ ...CTA, target: 'lead-form' });
  });

  // Negative guarantee: the backend refuses a button to the contact form while it is turned off.
  it('cannot target the contact form while it is turned off', () => {
    renderFields(CTA, false);

    expect(getPillOption('navigation-cta-target', 'lead-form')).toBeDisabled();
  });

  it('explains a button that already points at the turned-off contact form', () => {
    renderFields({ label: 'Falar', target: 'lead-form' }, false);

    expect(screen.getByText(/formulário de contato está desativado/i)).toBeInTheDocument();
  });
});
