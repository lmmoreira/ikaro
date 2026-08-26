// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { renderWithIntl } from '@/test-utils';
import { LeadFormTeaserFields } from './LeadFormTeaserFields';

describe('LeadFormTeaserFields', () => {
  it('renders the draft values, defaulting variant and bgStyle when unset', () => {
    renderWithIntl(
      <LeadFormTeaserFields
        draft={{ title: 'Fale com a gente', ctaLabel: 'Quero conversar' }}
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByDisplayValue('Fale com a gente')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Quero conversar')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Centralizado' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(screen.getByRole('radio', { name: 'Cor de fundo' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
  });

  it('reports each field edit via onChange', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderWithIntl(
      <LeadFormTeaserFields
        draft={{ title: '', ctaLabel: '', variant: 'centered', bgStyle: 'background' }}
        onChange={onChange}
      />,
    );

    await user.type(screen.getByLabelText('Título'), 'a');
    expect(onChange).toHaveBeenCalledWith({ title: 'a' });

    await user.click(screen.getByRole('radio', { name: 'Alinhado à esquerda' }));
    expect(onChange).toHaveBeenCalledWith({ variant: 'left-aligned' });

    await user.click(screen.getByRole('radio', { name: 'Cor primária' }));
    expect(onChange).toHaveBeenCalledWith({ bgStyle: 'primary' });
  });
});
