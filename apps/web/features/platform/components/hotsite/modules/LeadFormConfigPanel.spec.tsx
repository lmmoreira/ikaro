// @vitest-environment jsdom
import { screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
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
    } as unknown as ReturnType<typeof useLeadFormConfig>);

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
    } as unknown as ReturnType<typeof useLeadFormConfig>);

    renderWithIntl(<LeadFormConfigPanel data={{}} onChange={vi.fn()} />);

    expect(screen.getByText('Carregando configuração...')).toBeInTheDocument();
  });

  it('renders the error state when the manager config cannot be fetched', () => {
    mockUseLeadFormConfig.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
    } as unknown as ReturnType<typeof useLeadFormConfig>);
    renderWithIntl(<LeadFormConfigPanel data={{}} onChange={vi.fn()} />);
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Não foi possível carregar a configuração. Tente novamente.',
    );
  });

  it('adds and edits a question, preserving normalized order', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    mockUseLeadFormConfig.mockReturnValue({
      data: { title: '', ctaLabel: '', audienceMode: 'GUEST_AND_CUSTOMER', questions: [] },
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useLeadFormConfig>);
    renderWithIntl(<LeadFormConfigPanel data={{}} onChange={onChange} />);
    await user.click(screen.getByRole('button', { name: '+ Adicionar pergunta' }));
    const questionInput = screen.getByLabelText('Pergunta');
    await user.type(questionInput, 'Qual serviço?');
    expect(onChange).toHaveBeenCalled();
    expect(questionInput).toHaveValue('Qual serviço?');
  });

  it('preserves an applied local draft when the panel is reopened before publish', () => {
    mockUseLeadFormConfig.mockReturnValue({
      data: {
        title: 'Configuração publicada',
        ctaLabel: 'Publicar',
        audienceMode: 'GUEST_AND_CUSTOMER',
        questions: [],
      },
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useLeadFormConfig>);

    renderWithIntl(
      <LeadFormConfigPanel
        data={{
          title: 'Rascunho aplicado',
          ctaLabel: 'Salvar depois',
          audienceMode: 'CUSTOMER_ONLY',
          questions: [
            {
              id: 'draft-question',
              label: 'Pergunta no rascunho',
              type: 'TEXT',
              required: false,
              order: 0,
            },
          ],
        }}
        onChange={vi.fn()}
      />,
    );

    expect(screen.getByDisplayValue('Rascunho aplicado')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Pergunta no rascunho')).toBeInTheDocument();
    expect(screen.getByLabelText('Público')).toHaveValue('CUSTOMER_ONLY');
  });

  it('adds an editable starter question', async () => {
    const user = userEvent.setup();
    mockUseLeadFormConfig.mockReturnValue({
      data: { title: '', ctaLabel: '', audienceMode: 'GUEST_AND_CUSTOMER', questions: [] },
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useLeadFormConfig>);
    renderWithIntl(<LeadFormConfigPanel data={{}} onChange={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: 'Melhor horário para contato' }));

    expect(screen.getByDisplayValue('Melhor horário para contato')).toBeInTheDocument();
  });

  it('edits the teaser variant and background style', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    mockUseLeadFormConfig.mockReturnValue({
      data: { title: '', ctaLabel: '', audienceMode: 'GUEST_AND_CUSTOMER', questions: [] },
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useLeadFormConfig>);
    renderWithIntl(<LeadFormConfigPanel data={{}} onChange={onChange} />);

    expect(screen.getByLabelText('Layout')).toHaveValue('centered');
    expect(screen.getByLabelText('Estilo de fundo')).toHaveValue('background');

    await user.selectOptions(screen.getByLabelText('Layout'), 'left-aligned');
    await user.selectOptions(screen.getByLabelText('Estilo de fundo'), 'primary');

    expect(screen.getByLabelText('Layout')).toHaveValue('left-aligned');
    expect(screen.getByLabelText('Estilo de fundo')).toHaveValue('primary');
    expect(onChange).toHaveBeenCalled();
  });

  it('removes an unsubmitted question immediately and confirms submitted removal', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    mockUseLeadFormConfig.mockReturnValue({
      data: {
        title: '',
        ctaLabel: '',
        audienceMode: 'GUEST_AND_CUSTOMER',
        questions: [
          {
            id: 'q1',
            label: 'Livre',
            type: 'TEXT',
            required: false,
            order: 0,
            hasSubmissions: false,
          },
          {
            id: 'q2',
            label: 'Protegida',
            type: 'TEXT',
            required: false,
            order: 1,
            hasSubmissions: true,
          },
        ],
      },
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof useLeadFormConfig>);
    renderWithIntl(<LeadFormConfigPanel data={{}} onChange={onChange} />);
    const removeButtons = screen.getAllByRole('button', { name: 'Remover pergunta' });
    await user.click(removeButtons[0]);
    await waitFor(() => expect(screen.queryByDisplayValue('Livre')).not.toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'Remover pergunta' }));
    expect(
      screen.getByText(
        'As respostas já recebidas serão preservadas como um snapshot e não serão alteradas.',
      ),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Remover' }));
    expect(screen.queryByDisplayValue('Protegida')).not.toBeInTheDocument();
  });
});
