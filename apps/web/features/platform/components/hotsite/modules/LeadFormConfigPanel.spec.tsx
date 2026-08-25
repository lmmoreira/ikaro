// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { renderWithIntl } from '@/test-utils';
import { useLeadFormConfig } from '@/features/platform/hotsite/useHotsite';
import { LeadFormConfigPanel } from './LeadFormConfigPanel';

vi.mock('@/features/platform/hotsite/useHotsite', () => ({
  useLeadFormConfig: vi.fn(),
}));

const mockUseLeadFormConfig = vi.mocked(useLeadFormConfig);

describe('LeadFormConfigPanel', () => {
  it('renders the consolidated teaser, audience, and question fields', () => {
    mockUseLeadFormConfig.mockReturnValue({
      data: {
        title: 'Fale com a gente',
        ctaLabel: 'Quero conversar',
        audienceMode: 'GUEST_AND_CUSTOMER',
        questions: [
          {
            id: 'question-1',
            label: 'Qual serviço te interessa?',
            type: 'TEXT',
            required: true,
            order: 0,
            hasSubmissions: true,
          },
        ],
      },
      isLoading: false,
      isError: false,
    } as ReturnType<typeof useLeadFormConfig>);

    renderWithIntl(<LeadFormConfigPanel data={{}} onChange={vi.fn()} />);

    expect(screen.getByTestId('lead-form-config-panel')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Fale com a gente')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Qual serviço te interessa?')).toBeInTheDocument();
    expect(screen.getByText('Tem respostas')).toBeInTheDocument();
  });

  it('renders the loading state while the manager config is fetched', () => {
    mockUseLeadFormConfig.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    } as ReturnType<typeof useLeadFormConfig>);

    renderWithIntl(<LeadFormConfigPanel data={{}} onChange={vi.fn()} />);

    expect(screen.getByText('Carregando configuração...')).toBeInTheDocument();
  });
});
