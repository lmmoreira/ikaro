// @vitest-environment jsdom
import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { LeadFormSubmissionDetailResponse } from '@ikaro/types';
import { renderWithIntl } from '@/test-utils';
import { LeadFormSubmissionDetail } from './LeadFormSubmissionDetail';

const setBackHrefOverride = vi.hoisted(() => vi.fn());
const setBackLabelOverride = vi.hoisted(() => vi.fn());
const setPageTitleOverride = vi.hoisted(() => vi.fn());

vi.mock('@/shells/dashboard/components/topbar-status-context', () => ({
  useDashboardTopbarStatus: () => ({
    setBackHrefOverride,
    setBackLabelOverride,
    setPageTitleOverride,
  }),
}));

function buildSubmission(
  overrides?: Partial<LeadFormSubmissionDetailResponse>,
): LeadFormSubmissionDetailResponse {
  return {
    id: 'sub-1',
    name: 'Carlos Mendes',
    email: 'carlos.mendes@email.com',
    phone: '(11) 98888-7777',
    submittedAt: '2026-08-21T14:32:00.000Z',
    customerId: null,
    answers: [
      {
        questionLabel: 'Qual serviço te interessa?',
        questionType: 'TEXT',
        answerValue: 'Lavagem completa',
      },
      {
        questionLabel: 'Melhores dias para contato',
        questionType: 'MULTIPLE_CHOICE',
        answerValue: ['Manhã', 'Fim de semana'],
      },
    ],
    ...overrides,
  };
}

describe('LeadFormSubmissionDetail', () => {
  it('renders contact info', () => {
    renderWithIntl(<LeadFormSubmissionDetail submission={buildSubmission()} />);

    expect(screen.getByText('Carlos Mendes')).toBeInTheDocument();
    expect(screen.getByText('carlos.mendes@email.com')).toBeInTheDocument();
    expect(screen.getByText('(11) 98888-7777')).toBeInTheDocument();
  });

  it('renders every answer in the stored order, joining multiple-choice values with a comma', () => {
    renderWithIntl(<LeadFormSubmissionDetail submission={buildSubmission()} />);

    expect(screen.getByText('Qual serviço te interessa?')).toBeInTheDocument();
    expect(screen.getByText('Lavagem completa')).toBeInTheDocument();
    expect(screen.getByText('Melhores dias para contato')).toBeInTheDocument();
    expect(screen.getByText('Manhã, Fim de semana')).toBeInTheDocument();
  });

  it('renders the guest indicator when customerId is null', () => {
    renderWithIntl(<LeadFormSubmissionDetail submission={buildSubmission({ customerId: null })} />);

    expect(screen.getByText(/visitante \(não é cliente cadastrado\)/)).toBeInTheDocument();
  });

  it('renders the registered-customer indicator when customerId is set', () => {
    renderWithIntl(
      <LeadFormSubmissionDetail
        submission={buildSubmission({ customerId: '01234567-0000-7000-8000-00000000cafe' })}
      />,
    );

    expect(screen.getByText(/cliente cadastrado/)).toBeInTheDocument();
    expect(screen.queryByText(/visitante/)).not.toBeInTheDocument();
  });

  it('sets the topbar back-link and page title to the submission name on mount, clearing on unmount', () => {
    const { unmount } = renderWithIntl(
      <LeadFormSubmissionDetail submission={buildSubmission({ name: 'Maria Fernanda Costa' })} />,
    );

    expect(setBackHrefOverride).toHaveBeenCalledWith('/dashboard/leads');
    expect(setBackLabelOverride).toHaveBeenCalledWith('Leads');
    expect(setPageTitleOverride).toHaveBeenCalledWith('Maria Fernanda Costa');

    unmount();

    expect(setBackHrefOverride).toHaveBeenLastCalledWith(null);
    expect(setBackLabelOverride).toHaveBeenLastCalledWith(null);
    expect(setPageTitleOverride).toHaveBeenLastCalledWith(null);
  });
});
