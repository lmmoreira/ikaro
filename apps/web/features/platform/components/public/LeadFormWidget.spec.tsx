// @vitest-environment jsdom
import { clearPublicEnv, renderWithIntl, stubPublicEnv } from '@/test-utils';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CustomerProfileResponse, HotsiteLeadFormConfigResponse } from '@ikaro/types';
import { axe } from '@/axe-helper';
import { getHotsiteCustomerProfile } from '@/features/platform/hotsite/api/customers';
import {
  fetchLeadFormConfigClient,
  submitLeadFormClient,
} from '@/features/platform/hotsite/api/lead-form';
import { LeadFormWidget } from './LeadFormWidget';

vi.mock('@/features/platform/hotsite/api/customers', () => ({
  getHotsiteCustomerProfile: vi.fn(),
}));

vi.mock('@/features/platform/hotsite/api/lead-form', () => ({
  fetchLeadFormConfigClient: vi.fn(),
  submitLeadFormClient: vi.fn(),
}));

vi.mock('./TurnstileWidget', () => ({
  TurnstileWidget: ({
    onVerify,
    onExpire,
  }: {
    readonly onVerify: (token: string) => void;
    readonly onExpire: () => void;
  }) => (
    <>
      <button type="button" data-testid="turnstile-mock-verify" onClick={() => onVerify('tok-1')}>
        mock-verify
      </button>
      <button type="button" data-testid="turnstile-mock-expire" onClick={onExpire}>
        mock-expire
      </button>
    </>
  ),
}));

const SLUG = 'lavacar-beloauto';

const CONFIG_GUEST: HotsiteLeadFormConfigResponse = {
  audienceMode: 'GUEST_AND_CUSTOMER',
  questions: [
    { id: 'q1', label: 'Qual serviço?', type: 'TEXT', required: true, order: 1 },
    {
      id: 'q2',
      label: 'Melhor dia?',
      type: 'SINGLE_CHOICE',
      required: false,
      options: ['Manhã', 'Tarde'],
      order: 2,
    },
  ],
};

const CUSTOMER_PROFILE: CustomerProfileResponse = {
  customerId: 'cust-1',
  name: 'Maria Fernanda Costa',
  email: 'maria.fernanda@email.com',
  phone: '+5511977771234',
  defaultAddress: null,
};

function mockConfig(config: HotsiteLeadFormConfigResponse | Error) {
  if (config instanceof Error) {
    vi.mocked(fetchLeadFormConfigClient).mockRejectedValue(config);
  } else {
    vi.mocked(fetchLeadFormConfigClient).mockResolvedValue(config);
  }
}

async function fillContactFields(user: ReturnType<typeof userEvent.setup>) {
  await screen.findByTestId('lead-form-name');
  await user.type(screen.getByTestId('lead-form-name'), 'Carlos Mendes');
  await user.type(screen.getByTestId('lead-form-email'), 'carlos@example.com');
  await user.type(screen.getByTestId('lead-form-phone'), '+5511988887777');
}

beforeEach(() => {
  stubPublicEnv({ NEXT_PUBLIC_TURNSTILE_SITE_KEY: '1x00000000000000000000AA' });
});

afterEach(() => {
  clearPublicEnv();
  vi.mocked(fetchLeadFormConfigClient).mockReset();
  vi.mocked(getHotsiteCustomerProfile).mockReset();
  vi.mocked(submitLeadFormClient).mockReset();
});

describe('LeadFormWidget — loading', () => {
  it('shows the loading skeleton while the config/profile fetches are in flight', () => {
    mockConfig(new Promise(() => {}) as never);
    vi.mocked(getHotsiteCustomerProfile).mockReturnValue(new Promise(() => {}));

    renderWithIntl(<LeadFormWidget slug={SLUG} title="Quer um orçamento?" />);

    expect(screen.getByTestId('lead-form-loading')).toBeInTheDocument();
  });
});

describe('LeadFormWidget — guest happy path (GUEST_AND_CUSTOMER)', () => {
  beforeEach(() => {
    mockConfig(CONFIG_GUEST);
    vi.mocked(getHotsiteCustomerProfile).mockResolvedValue(null);
  });

  it('renders the form with the module title/subtitle once loaded', async () => {
    renderWithIntl(<LeadFormWidget slug={SLUG} title="Quer um orçamento?" subtitle="Responda!" />);

    await screen.findByTestId('lead-form-name');
    expect(screen.getByText('Quer um orçamento?')).toBeInTheDocument();
    expect(screen.getByText('Responda!')).toBeInTheDocument();
  });

  it('submits successfully end-to-end and shows the success view', async () => {
    const user = userEvent.setup();
    vi.mocked(submitLeadFormClient).mockResolvedValue({ ok: true, submissionId: 'sub-1' });
    renderWithIntl(<LeadFormWidget slug={SLUG} title="Quer um orçamento?" />);

    await fillContactFields(user);
    await user.type(screen.getByTestId('lead-form-question-q1'), 'Lavagem completa');
    await user.click(screen.getByTestId('turnstile-mock-verify'));
    await user.click(screen.getByTestId('lead-form-submit'));

    expect(await screen.findByTestId('lead-form-success')).toBeInTheDocument();
    expect(submitLeadFormClient).toHaveBeenCalledWith(SLUG, {
      name: 'Carlos Mendes',
      email: 'carlos@example.com',
      phone: '+5511988887777',
      answers: [{ questionId: 'q1', value: 'Lavagem completa' }],
      turnstileToken: 'tok-1',
    });
  });

  it('blocks submission and shows the validation banner when a required field is blank', async () => {
    const user = userEvent.setup();
    renderWithIntl(<LeadFormWidget slug={SLUG} title="Quer um orçamento?" />);

    await screen.findByTestId('lead-form-name');
    await user.click(screen.getByTestId('turnstile-mock-verify'));
    await user.click(screen.getByTestId('lead-form-submit'));

    expect(screen.getByTestId('lead-form-validation-banner')).toBeInTheDocument();
    expect(screen.getByTestId('lead-form-name-error')).toBeInTheDocument();
    expect(screen.getByTestId('lead-form-question-q1-error')).toBeInTheDocument();
    expect(submitLeadFormClient).not.toHaveBeenCalled();
  });

  it('clears a verified token when the widget reports it expired, requiring re-verification before submit', async () => {
    const user = userEvent.setup();
    renderWithIntl(<LeadFormWidget slug={SLUG} title="Quer um orçamento?" />);

    await fillContactFields(user);
    await user.type(screen.getByTestId('lead-form-question-q1'), 'Lavagem completa');
    await user.click(screen.getByTestId('turnstile-mock-verify'));
    await user.click(screen.getByTestId('turnstile-mock-expire'));
    await user.click(screen.getByTestId('lead-form-submit'));

    expect(screen.getByTestId('lead-form-captcha-banner')).toBeInTheDocument();
    expect(submitLeadFormClient).not.toHaveBeenCalled();
  });

  it('shows a captcha-error banner (form still visible) when submitting without a turnstile token', async () => {
    const user = userEvent.setup();
    renderWithIntl(<LeadFormWidget slug={SLUG} title="Quer um orçamento?" />);

    await fillContactFields(user);
    await user.type(screen.getByTestId('lead-form-question-q1'), 'Lavagem completa');
    await user.click(screen.getByTestId('lead-form-submit'));

    expect(screen.getByTestId('lead-form-captcha-banner')).toBeInTheDocument();
    expect(screen.getByTestId('lead-form-name')).toBeInTheDocument();
    expect(submitLeadFormClient).not.toHaveBeenCalled();
  });

  it('shows the rate-limited terminal card on a 429 daily-cap response', async () => {
    const user = userEvent.setup();
    vi.mocked(submitLeadFormClient).mockResolvedValue({
      ok: false,
      status: 429,
      code: 'PLATFORM_LEAD_FORM_DAILY_CAP_REACHED',
    });
    renderWithIntl(<LeadFormWidget slug={SLUG} title="Quer um orçamento?" />);

    await fillContactFields(user);
    await user.type(screen.getByTestId('lead-form-question-q1'), 'Lavagem completa');
    await user.click(screen.getByTestId('turnstile-mock-verify'));
    await user.click(screen.getByTestId('lead-form-submit'));

    const card = await screen.findByTestId('lead-form-terminal-card');
    expect(card).toHaveTextContent('Muitas solicitações no momento');
    expect(screen.queryByTestId('lead-form-retry')).not.toBeInTheDocument();
  });

  it('shows the captcha-error banner (form re-shown) on a Turnstile-verification-failed response', async () => {
    const user = userEvent.setup();
    vi.mocked(submitLeadFormClient).mockResolvedValue({
      ok: false,
      status: 400,
      code: 'BFF_TURNSTILE_VERIFICATION_FAILED',
    });
    renderWithIntl(<LeadFormWidget slug={SLUG} title="Quer um orçamento?" />);

    await fillContactFields(user);
    await user.type(screen.getByTestId('lead-form-question-q1'), 'Lavagem completa');
    await user.click(screen.getByTestId('turnstile-mock-verify'));
    await user.click(screen.getByTestId('lead-form-submit'));

    expect(await screen.findByTestId('lead-form-captcha-banner')).toBeInTheDocument();
    expect(screen.getByTestId('lead-form-name')).toHaveValue('Carlos Mendes');
  });

  it('shows a field-level error when the backend rejects an invalid email on submit', async () => {
    const user = userEvent.setup();
    vi.mocked(submitLeadFormClient).mockResolvedValue({
      ok: false,
      status: 400,
      code: 'EMAIL_FORMAT_INVALID',
      field: 'email',
    });
    renderWithIntl(<LeadFormWidget slug={SLUG} title="Quer um orçamento?" />);

    await fillContactFields(user);
    await user.type(screen.getByTestId('lead-form-question-q1'), 'Lavagem completa');
    await user.click(screen.getByTestId('turnstile-mock-verify'));
    await user.click(screen.getByTestId('lead-form-submit'));

    expect(await screen.findByTestId('lead-form-validation-banner')).toBeInTheDocument();
    expect(screen.getByTestId('lead-form-email-error')).toBeInTheDocument();
  });

  it('shows the submission-error terminal card and lets the visitor retry back into the filled form', async () => {
    const user = userEvent.setup();
    vi.mocked(submitLeadFormClient).mockResolvedValue({ ok: false, status: 0 });
    renderWithIntl(<LeadFormWidget slug={SLUG} title="Quer um orçamento?" />);

    await fillContactFields(user);
    await user.type(screen.getByTestId('lead-form-question-q1'), 'Lavagem completa');
    await user.click(screen.getByTestId('turnstile-mock-verify'));
    await user.click(screen.getByTestId('lead-form-submit'));

    const card = await screen.findByTestId('lead-form-terminal-card');
    expect(card).toHaveTextContent('Não foi possível enviar');

    await user.click(screen.getByTestId('lead-form-retry'));

    expect(screen.getByTestId('lead-form-name')).toHaveValue('Carlos Mendes');
  });

  it('has no accessibility violations on the happy-path form', async () => {
    const { container } = renderWithIntl(<LeadFormWidget slug={SLUG} title="Quer um orçamento?" />);
    await screen.findByTestId('lead-form-name');
    expect(await axe(container)).toHaveNoViolations();
  });
});

describe('LeadFormWidget — CUSTOMER_ONLY audience', () => {
  const configCustomerOnly: HotsiteLeadFormConfigResponse = {
    ...CONFIG_GUEST,
    audienceMode: 'CUSTOMER_ONLY',
  };

  it('shows the login-required gate for an unauthenticated visitor', async () => {
    mockConfig(configCustomerOnly);
    vi.mocked(getHotsiteCustomerProfile).mockResolvedValue(null);

    renderWithIntl(<LeadFormWidget slug={SLUG} title="Quer um orçamento?" />);

    expect(await screen.findByTestId('lead-form-login-required')).toBeInTheDocument();
    expect(screen.queryByTestId('lead-form-name')).not.toBeInTheDocument();
  });

  it('shows the prefilled form for an authenticated customer, with a prefilled note', async () => {
    mockConfig(configCustomerOnly);
    vi.mocked(getHotsiteCustomerProfile).mockResolvedValue(CUSTOMER_PROFILE);

    renderWithIntl(<LeadFormWidget slug={SLUG} title="Quer um orçamento?" />);

    await waitFor(() => {
      expect(screen.getByTestId('lead-form-name')).toHaveValue('Maria Fernanda Costa');
    });
    expect(screen.getByTestId('lead-form-email')).toHaveValue('maria.fernanda@email.com');
    expect(screen.getByTestId('lead-form-phone')).toHaveValue('+5511977771234');
    expect(screen.getByText(/Preenchido com os dados da sua conta/)).toBeInTheDocument();
  });

  it('lets the authenticated customer edit a prefilled field', async () => {
    const user = userEvent.setup();
    mockConfig(configCustomerOnly);
    vi.mocked(getHotsiteCustomerProfile).mockResolvedValue(CUSTOMER_PROFILE);

    renderWithIntl(<LeadFormWidget slug={SLUG} title="Quer um orçamento?" />);

    await waitFor(() => {
      expect(screen.getByTestId('lead-form-name')).toHaveValue('Maria Fernanda Costa');
    });

    await user.clear(screen.getByTestId('lead-form-name'));
    await user.type(screen.getByTestId('lead-form-name'), 'Maria F. Costa');

    expect(screen.getByTestId('lead-form-name')).toHaveValue('Maria F. Costa');
  });
});

describe('LeadFormWidget — config fetch failure', () => {
  it('shows a terminal error card and allows retrying the config fetch', async () => {
    mockConfig(new Error('network error'));
    vi.mocked(getHotsiteCustomerProfile).mockResolvedValue(null);

    renderWithIntl(<LeadFormWidget slug={SLUG} title="Quer um orçamento?" />);

    const card = await screen.findByTestId('lead-form-terminal-card');
    expect(card).toHaveTextContent('Não foi possível enviar');
  });
});
