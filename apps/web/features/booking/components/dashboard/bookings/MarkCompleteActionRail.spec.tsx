// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithIntl } from '@/test-utils';
import { MarkCompleteActionRail } from './MarkCompleteActionRail';

describe('MarkCompleteActionRail', () => {
  it('shows the error message when error is set', () => {
    renderWithIntl(
      <MarkCompleteActionRail
        error="Falha ao concluir"
        isSubmitting={false}
        backHref="/dashboard/bookings"
      />,
    );

    expect(screen.getAllByText('Falha ao concluir').length).toBeGreaterThan(0);
  });

  it('omits the error card when error is null', () => {
    renderWithIntl(
      <MarkCompleteActionRail error={null} isSubmitting={false} backHref="/dashboard/bookings" />,
    );

    expect(screen.queryByText('Falha ao concluir')).not.toBeInTheDocument();
  });

  it('disables the submit button while isSubmitting is true', () => {
    renderWithIntl(
      <MarkCompleteActionRail error={null} isSubmitting backHref="/dashboard/bookings" />,
    );

    expect(screen.getAllByRole('button', { name: 'Confirmar conclusão' })[0]).toBeDisabled();
  });

  it('links the cancel action to backHref', () => {
    renderWithIntl(
      <MarkCompleteActionRail
        error={null}
        isSubmitting={false}
        backHref="/dashboard/bookings/b-1"
      />,
    );

    expect(screen.getAllByRole('link', { name: 'Cancelar' })[0]).toHaveAttribute(
      'href',
      '/dashboard/bookings/b-1',
    );
  });
});
