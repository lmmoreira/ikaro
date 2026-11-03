// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWithIntl } from '@/test-utils';
import { RescheduleNotesCard } from './RescheduleNotesCard';

describe('RescheduleNotesCard', () => {
  it('keeps the heading and the textarea inside one card', () => {
    const { container } = renderWithIntl(<RescheduleNotesCard value="" onChange={vi.fn()} />);

    const heading = screen.getByText('Observações');
    const textarea = screen.getByRole('textbox');
    const card = container.querySelector('section > div');
    expect(card).toContainElement(heading);
    expect(card).toContainElement(textarea);
    expect(heading).toHaveClass('text-sm', 'font-semibold');
  });

  it('reports what the manager types and caps it at 500 characters', async () => {
    const onChange = vi.fn();
    renderWithIntl(<RescheduleNotesCard value="" onChange={onChange} />);

    const textarea = screen.getByRole('textbox');
    await userEvent.type(textarea, 'a');

    expect(onChange).toHaveBeenCalledWith('a');
    expect(textarea).toHaveAttribute('maxlength', '500');
  });
});
