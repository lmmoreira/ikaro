// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { renderWithIntl } from '@/test-utils';
import { Button } from '@/shared/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from './popover';

describe('Popover', () => {
  it('opens the content when the trigger is clicked', async () => {
    const user = userEvent.setup();

    renderWithIntl(
      <Popover>
        <PopoverTrigger asChild>
          <Button type="button">Abrir</Button>
        </PopoverTrigger>
        <PopoverContent>Conteúdo</PopoverContent>
      </Popover>,
    );

    expect(screen.queryByText('Conteúdo')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Abrir' }));

    expect(screen.getByText('Conteúdo')).toBeInTheDocument();
  });
});
