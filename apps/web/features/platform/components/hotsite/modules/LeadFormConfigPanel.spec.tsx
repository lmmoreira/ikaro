// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithIntl } from '@/test-utils';
import { LeadFormConfigPanel } from './LeadFormConfigPanel';

describe('LeadFormConfigPanel', () => {
  it('renders a coming-soon placeholder message', () => {
    renderWithIntl(<LeadFormConfigPanel />);

    expect(screen.getByTestId('lead-form-config-panel-placeholder')).toBeInTheDocument();
    expect(screen.getByText('Configuração em breve')).toBeInTheDocument();
  });
});
