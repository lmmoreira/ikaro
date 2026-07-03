// @vitest-environment jsdom
import React from 'react';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { renderWithIntl } from '@/test-utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './select';

describe('Select', () => {
  it('renders the selected value and allows changing it', async () => {
    const user = userEvent.setup();

    function Example(): React.JSX.Element {
      const [value, setValue] = React.useState('1');
      return (
        <Select value={value} onValueChange={setValue}>
          <SelectTrigger aria-label="Escolher número">
            <SelectValue placeholder="Escolher" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="1">Um</SelectItem>
            <SelectItem value="2">Dois</SelectItem>
          </SelectContent>
        </Select>
      );
    }

    renderWithIntl(<Example />);

    await user.click(screen.getByRole('combobox', { name: 'Escolher número' }));
    await user.click(screen.getByRole('option', { name: 'Dois' }));

    expect(screen.getByRole('combobox', { name: 'Escolher número' })).toHaveTextContent('Dois');
  });
});
