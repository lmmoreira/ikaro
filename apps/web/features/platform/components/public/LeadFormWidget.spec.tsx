// @vitest-environment jsdom
import { clearPublicEnv, renderWithIntl, stubPublicEnv } from '@/test-utils';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PlatformErrorCode } from '@ikaro/types';
import type { CustomerProfileResponse, HotsiteLeadFormConfigResponse } from '@ikaro/types';
import { axe } from '@/axe-helper';
import { getHotsiteCustomerProfile } from '@/features/platform/hotsite/api/customers';
import {
  fetchLeadFormConfigClient,
  submitLeadFormClient,
} from '@/features/platform/hotsite/api/lead-form';
import { ApiError } from '@/shared/lib/api/errors';
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
    onLoadTimeout,
  }: {
    readonly onVerify: (token: string) => void;
    readonly onExpire: () => void;
    readonly onLoadTimeout: () => void;
  }) => (
    <>
      <button type="button" data-testid="turnstile-mock-verify" onClick={() => onVerify('tok-1')}>
        mock-verify
      </button>
      <button type="button" data-testid="turnstile-mock-expire" onClick={onExpire}>
        mock-expire
      </button>
      <button type="button" data-testid="turnstile-mock-load-timeout" onClick={onLoadTimeout}>
        mock-load-timeout
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
  // Local digits only — the +55 prefix is a fixed adornment beside the input, never typed by
  // the user (docs/CODE_STANDARDS.md § localization-driven fields); buildContactPhone derives
  // the full +5511988887777 E.164 value from these digits.
  await user.type(screen.getByTestId('lead-form-phone'), '11988887777');
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

    renderWithIntl(<LeadFormWidget slug={SLUG} title="Quer um orçamento?" phonePrefix="+55" />);

    expect(screen.getByTestId('lead-form-loading')).toBeInTheDocument();
  });
});

describe('LeadFormWidget — guest happy path (GUEST_AND_CUSTOMER)', () => {
  beforeEach(() => {
    mockConfig(CONFIG_GUEST);
    vi.mocked(getHotsiteCustomerProfile).mockResolvedValue(null);
  });

  it('renders the form with the module title/subtitle once loaded', async () => {
    renderWithIntl(
      <LeadFormWidget
        slug={SLUG}
        title="Quer um orçamento?"
        phonePrefix="+55"
        subtitle="Responda!"
      />,
    );

    await screen.findByTestId('lead-form-name');
    expect(screen.getByText('Quer um orçamento?')).toBeInTheDocument();
    expect(screen.getByText('Responda!')).toBeInTheDocument();
  });

  it('submits successfully end-to-end and shows the success view', async () => {
    const user = userEvent.setup();
    vi.mocked(submitLeadFormClient).mockResolvedValue({ ok: true, submissionId: 'sub-1' });
    renderWithIntl(<LeadFormWidget slug={SLUG} title="Quer um orçamento?" phonePrefix="+55" />);

    await fillContactFields(user);
    await user.type(screen.getByTestId('lead-form-question'), 'Lavagem completa');
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
    renderWithIntl(<LeadFormWidget slug={SLUG} title="Quer um orçamento?" phonePrefix="+55" />);

    await screen.findByTestId('lead-form-name');
    await user.click(screen.getByTestId('turnstile-mock-verify'));
    await user.click(screen.getByTestId('lead-form-submit'));

    expect(screen.getByTestId('lead-form-validation-banner')).toBeInTheDocument();
    expect(screen.getByTestId('lead-form-name-error')).toBeInTheDocument();
    expect(screen.getByTestId('lead-form-question-error')).toBeInTheDocument();
    expect(submitLeadFormClient).not.toHaveBeenCalled();
  });

  // The <input type="email"> plus a custom validate() means the <form> must carry noValidate —
  // without it, the browser's own constraint validation can swallow the submit event before this
  // component's handler ever runs, so the localized emailRequired error never renders (Codex
  // finding, PR #433 round 7). jsdom doesn't implement submit-blocking constraint validation the
  // way a real browser does, so this test can't reproduce that interception directly — it does
  // confirm the custom validator itself still owns and rejects a syntactically invalid email.
  it('shows a field-level error for a syntactically invalid email typed into the form', async () => {
    const user = userEvent.setup();
    renderWithIntl(<LeadFormWidget slug={SLUG} title="Quer um orçamento?" phonePrefix="+55" />);

    await screen.findByTestId('lead-form-name');
    await user.type(screen.getByTestId('lead-form-name'), 'Carlos Mendes');
    await user.type(screen.getByTestId('lead-form-email'), 'not-an-email');
    await user.type(screen.getByTestId('lead-form-phone'), '11988887777');
    await user.click(screen.getByTestId('turnstile-mock-verify'));
    await user.click(screen.getByTestId('lead-form-submit'));

    expect(screen.getByTestId('lead-form-email-error')).toBeInTheDocument();
    expect(submitLeadFormClient).not.toHaveBeenCalled();
  });

  it('clears a verified token when the widget reports it expired, requiring re-verification before submit', async () => {
    const user = userEvent.setup();
    renderWithIntl(<LeadFormWidget slug={SLUG} title="Quer um orçamento?" phonePrefix="+55" />);

    await fillContactFields(user);
    await user.type(screen.getByTestId('lead-form-question'), 'Lavagem completa');
    await user.click(screen.getByTestId('turnstile-mock-verify'));
    await user.click(screen.getByTestId('turnstile-mock-expire'));
    await user.click(screen.getByTestId('lead-form-submit'));

    expect(screen.getByTestId('lead-form-captcha-banner')).toBeInTheDocument();
    expect(submitLeadFormClient).not.toHaveBeenCalled();
  });

  // M20-S15: a script that never loads (CSP block, ad-blocker, edge issue, network flake)
  // previously left the widget hung silently forever with no user-facing signal. onLoadTimeout
  // reuses the same reset sequence as a server-rejected token, surfacing the existing retry UI.
  it('shows the captcha-error retry banner when the Turnstile script never loads within the timeout', async () => {
    const user = userEvent.setup();
    renderWithIntl(<LeadFormWidget slug={SLUG} title="Quer um orçamento?" phonePrefix="+55" />);

    await fillContactFields(user);
    await user.type(screen.getByTestId('lead-form-question'), 'Lavagem completa');
    await user.click(screen.getByTestId('turnstile-mock-load-timeout'));

    expect(screen.getByTestId('lead-form-captcha-banner')).toBeInTheDocument();
    expect(screen.getByTestId('lead-form-name')).toHaveValue('Carlos Mendes');
  });

  // CodeRabbit round 1 (PR #440): onTurnstileVerify only set turnstileToken, never clearing
  // phase — so a successful re-verification after the timeout's remount left the captcha-error
  // banner visible with a now-valid token until the next submit click reset phase as a side
  // effect. This proves the banner clears immediately on re-verification instead.
  it('clears the captcha-error banner as soon as the remounted widget re-verifies successfully', async () => {
    const user = userEvent.setup();
    renderWithIntl(<LeadFormWidget slug={SLUG} title="Quer um orçamento?" phonePrefix="+55" />);

    await fillContactFields(user);
    await user.type(screen.getByTestId('lead-form-question'), 'Lavagem completa');
    await user.click(screen.getByTestId('turnstile-mock-load-timeout'));

    expect(screen.getByTestId('lead-form-captcha-banner')).toBeInTheDocument();

    await user.click(screen.getByTestId('turnstile-mock-verify'));

    expect(screen.queryByTestId('lead-form-captcha-banner')).not.toBeInTheDocument();
  });

  it('shows a captcha-error banner (form still visible) when submitting without a turnstile token', async () => {
    const user = userEvent.setup();
    renderWithIntl(<LeadFormWidget slug={SLUG} title="Quer um orçamento?" phonePrefix="+55" />);

    await fillContactFields(user);
    await user.type(screen.getByTestId('lead-form-question'), 'Lavagem completa');
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
    renderWithIntl(<LeadFormWidget slug={SLUG} title="Quer um orçamento?" phonePrefix="+55" />);

    await fillContactFields(user);
    await user.type(screen.getByTestId('lead-form-question'), 'Lavagem completa');
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
      code: 'PLATFORM_LEAD_FORM_TURNSTILE_VERIFICATION_FAILED',
    });
    renderWithIntl(<LeadFormWidget slug={SLUG} title="Quer um orçamento?" phonePrefix="+55" />);

    await fillContactFields(user);
    await user.type(screen.getByTestId('lead-form-question'), 'Lavagem completa');
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
    renderWithIntl(<LeadFormWidget slug={SLUG} title="Quer um orçamento?" phonePrefix="+55" />);

    await fillContactFields(user);
    await user.type(screen.getByTestId('lead-form-question'), 'Lavagem completa');
    await user.click(screen.getByTestId('turnstile-mock-verify'));
    await user.click(screen.getByTestId('lead-form-submit'));

    expect(await screen.findByTestId('lead-form-validation-banner')).toBeInTheDocument();
    expect(screen.getByTestId('lead-form-email-error')).toBeInTheDocument();
  });

  it('shows the submission-error terminal card and lets the visitor retry back into the filled form', async () => {
    const user = userEvent.setup();
    vi.mocked(submitLeadFormClient).mockResolvedValue({ ok: false, status: 0 });
    renderWithIntl(<LeadFormWidget slug={SLUG} title="Quer um orçamento?" phonePrefix="+55" />);

    await fillContactFields(user);
    await user.type(screen.getByTestId('lead-form-question'), 'Lavagem completa');
    await user.click(screen.getByTestId('turnstile-mock-verify'));
    await user.click(screen.getByTestId('lead-form-submit'));

    const card = await screen.findByTestId('lead-form-terminal-card');
    expect(card).toHaveTextContent('Não foi possível enviar');

    await user.click(screen.getByTestId('lead-form-retry'));

    expect(screen.getByTestId('lead-form-name')).toHaveValue('Carlos Mendes');
  });

  it('has no accessibility violations on the happy-path form', async () => {
    const { container } = renderWithIntl(
      <LeadFormWidget slug={SLUG} title="Quer um orçamento?" phonePrefix="+55" />,
    );
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

    renderWithIntl(<LeadFormWidget slug={SLUG} title="Quer um orçamento?" phonePrefix="+55" />);

    expect(await screen.findByTestId('lead-form-login-required')).toBeInTheDocument();
    expect(screen.queryByTestId('lead-form-name')).not.toBeInTheDocument();
  });

  it('shows the prefilled form for an authenticated customer, with a prefilled note', async () => {
    mockConfig(configCustomerOnly);
    vi.mocked(getHotsiteCustomerProfile).mockResolvedValue(CUSTOMER_PROFILE);

    renderWithIntl(<LeadFormWidget slug={SLUG} title="Quer um orçamento?" phonePrefix="+55" />);

    await waitFor(() => {
      expect(screen.getByTestId('lead-form-name')).toHaveValue('Maria Fernanda Costa');
    });
    expect(screen.getByTestId('lead-form-email')).toHaveValue('maria.fernanda@email.com');
    // Displayed masked/local, not the raw E.164 stored in state — matches ContactInfoFields'
    // established phonePrefix display convention (docs/CODE_STANDARDS.md).
    expect(screen.getByTestId('lead-form-phone')).toHaveValue('(11) 97777-1234');
    expect(screen.getByText(/Preenchido com os dados da sua conta/)).toBeInTheDocument();
  });

  // A brand-new customer with no phone on file yet — UC-040 main flow ("visible, editable
  // autofill"). E2E-only coverage of this exact scenario hits a pre-existing, unrelated gate
  // (InformationCompletionPrompt, app/[slug]/layout.tsx) that blocks any authenticated customer
  // missing phone/address on every hotsite route, so the real E2E test completes the profile
  // first instead (M20-S09 PR #433 round 4 decision) — this component-level test is what actually
  // proves the phone field starts empty and editable when the profile has none.
  it('leaves the phone field empty and editable when the customer profile has no phone yet', async () => {
    mockConfig(configCustomerOnly);
    vi.mocked(getHotsiteCustomerProfile).mockResolvedValue({ ...CUSTOMER_PROFILE, phone: null });

    renderWithIntl(<LeadFormWidget slug={SLUG} title="Quer um orçamento?" phonePrefix="+55" />);

    await waitFor(() => {
      expect(screen.getByTestId('lead-form-name')).toHaveValue('Maria Fernanda Costa');
    });
    expect(screen.getByTestId('lead-form-phone')).toHaveValue('');
  });

  it('lets the authenticated customer edit a prefilled field', async () => {
    const user = userEvent.setup();
    mockConfig(configCustomerOnly);
    vi.mocked(getHotsiteCustomerProfile).mockResolvedValue(CUSTOMER_PROFILE);

    renderWithIntl(<LeadFormWidget slug={SLUG} title="Quer um orçamento?" phonePrefix="+55" />);

    await waitFor(() => {
      expect(screen.getByTestId('lead-form-name')).toHaveValue('Maria Fernanda Costa');
    });

    await user.clear(screen.getByTestId('lead-form-name'));
    await user.type(screen.getByTestId('lead-form-name'), 'Maria F. Costa');

    expect(screen.getByTestId('lead-form-name')).toHaveValue('Maria F. Costa');
  });
});

describe('LeadFormWidget — config fetch failure', () => {
  it('shows a terminal error card, and retrying actually re-fetches and exits the loading state on success', async () => {
    const user = userEvent.setup();
    vi.mocked(fetchLeadFormConfigClient).mockRejectedValueOnce(new Error('network error'));
    vi.mocked(getHotsiteCustomerProfile).mockResolvedValue(null);

    renderWithIntl(<LeadFormWidget slug={SLUG} title="Quer um orçamento?" phonePrefix="+55" />);

    const card = await screen.findByTestId('lead-form-terminal-card');
    expect(card).toHaveTextContent('Não foi possível enviar');

    // The exact round-1 regression this guards against: clicking retry cleared `config` but
    // never re-ran the fetch effect (config never depended on anything a retry could change),
    // so the visitor was stuck on the loading skeleton forever — this assertion fails if that
    // regresses, unlike the original version of this test, which only checked the first failure
    // and would have stayed green through that exact bug (PR #433 review round 2).
    vi.mocked(fetchLeadFormConfigClient).mockResolvedValueOnce(CONFIG_GUEST);
    await user.click(screen.getByTestId('lead-form-retry'));

    await screen.findByTestId('lead-form-name');
    expect(screen.queryByTestId('lead-form-terminal-card')).not.toBeInTheDocument();
    expect(fetchLeadFormConfigClient).toHaveBeenCalledTimes(2);
  });

  // ISR-cached page can go stale between server render and this live client fetch — the module
  // may have been disabled in that window. Must route to the same <Unavailable/> the server-side
  // check renders, not the generic submission-error card (Codex finding, PR #433 round 10).
  it('renders Unavailable, not a generic error card, when the config fetch reports the module is disabled', async () => {
    vi.mocked(fetchLeadFormConfigClient).mockRejectedValueOnce(
      new ApiError(404, 'not enabled', { code: PlatformErrorCode.LEAD_FORM_NOT_ENABLED }),
    );
    vi.mocked(getHotsiteCustomerProfile).mockResolvedValue(null);

    renderWithIntl(<LeadFormWidget slug={SLUG} title="Quer um orçamento?" phonePrefix="+55" />);

    await screen.findByText('Em breve');
    expect(screen.queryByTestId('lead-form-terminal-card')).not.toBeInTheDocument();
    expect(screen.queryByTestId('lead-form-name')).not.toBeInTheDocument();
  });
});
