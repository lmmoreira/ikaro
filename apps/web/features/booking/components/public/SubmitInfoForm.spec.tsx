// @vitest-environment jsdom
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { renderWithIntl } from '@/test-utils';
import {
  submitGuestBookingInfo,
  SubmitGuestBookingInfoError,
  createGuestAttachmentSignedUrl,
} from '@/features/booking/api/public';
import { SubmitInfoForm } from './SubmitInfoForm';

vi.mock('@/features/booking/api/public', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/booking/api/public')>();
  return {
    ...actual,
    submitGuestBookingInfo: vi.fn(),
    createGuestAttachmentSignedUrl: vi.fn(),
  };
});

function makeFile(name: string, type: string): File {
  return new File(['fake-image-content'], name, { type });
}

const BOOKING_ID = 'booking-1';
const TOKEN = 'signed.jwt.token';

const summary = {
  serviceSummary: 'Lavagem Simples',
  scheduledAt: '2026-06-18T13:00:00.000Z',
  infoRequestMessage: 'Envie fotos do veículo antes da lavagem.',
  contactName: 'João da Silva',
};

describe('SubmitInfoForm', () => {
  beforeEach(() => {
    vi.mocked(submitGuestBookingInfo).mockReset();
    vi.mocked(createGuestAttachmentSignedUrl).mockReset();
  });

  it('renders the form with a summary card when summary is provided', () => {
    renderWithIntl(
      <SubmitInfoForm
        bookingId={BOOKING_ID}
        token={TOKEN}
        summary={summary}
        brandName="BeloAuto"
      />,
    );

    expect(screen.getByText('Lavagem Simples')).toBeInTheDocument();
    expect(screen.getByText(/Envie fotos do veículo/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Sua resposta/)).toBeInTheDocument();
  });

  it('renders the form without a summary card when summary is null', () => {
    renderWithIntl(<SubmitInfoForm bookingId={BOOKING_ID} token={TOKEN} summary={null} />);

    expect(screen.queryByText('Lavagem Simples')).not.toBeInTheDocument();
    expect(screen.getByLabelText(/Sua resposta/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Enviar resposta' })).toBeInTheDocument();
  });

  it('shows a validation error and does not call the API when response is empty', async () => {
    const user = userEvent.setup();
    renderWithIntl(<SubmitInfoForm bookingId={BOOKING_ID} token={TOKEN} summary={null} />);

    await user.click(screen.getByRole('button', { name: 'Enviar resposta' }));

    expect(screen.getByText('Informe sua resposta antes de enviar.')).toBeInTheDocument();
    expect(submitGuestBookingInfo).not.toHaveBeenCalled();
  });

  it('submits successfully and replaces the form with the success screen', async () => {
    vi.mocked(submitGuestBookingInfo).mockResolvedValue({
      bookingId: BOOKING_ID,
      status: 'PENDING',
      infoSubmittedAt: '2026-06-17T14:30:00.000Z',
    });
    const user = userEvent.setup();
    renderWithIntl(
      <SubmitInfoForm
        bookingId={BOOKING_ID}
        token={TOKEN}
        summary={summary}
        brandName="BeloAuto"
      />,
    );

    await user.type(screen.getByLabelText(/Sua resposta/), 'Segue a foto do veículo.');
    await user.click(screen.getByRole('button', { name: 'Enviar resposta' }));

    await waitFor(() => expect(screen.getByText('Resposta enviada!')).toBeInTheDocument());
    expect(screen.queryByLabelText(/Sua resposta/)).not.toBeInTheDocument();
    expect(submitGuestBookingInfo).toHaveBeenCalledWith(BOOKING_ID, TOKEN, {
      response: 'Segue a foto do veículo.',
    });
  });

  it('links the success screen CTAs to the tenant hotsite and login when tenantSlug is known', async () => {
    vi.mocked(submitGuestBookingInfo).mockResolvedValue({
      bookingId: BOOKING_ID,
      status: 'PENDING',
      infoSubmittedAt: '2026-06-17T14:30:00.000Z',
    });
    const user = userEvent.setup();
    renderWithIntl(
      <SubmitInfoForm
        bookingId={BOOKING_ID}
        token={TOKEN}
        summary={summary}
        tenantSlug="lavacar-beloauto"
      />,
    );

    await user.type(screen.getByLabelText(/Sua resposta/), 'Segue a foto do veículo.');
    await user.click(screen.getByRole('button', { name: 'Enviar resposta' }));

    await waitFor(() => expect(screen.getByText('Resposta enviada!')).toBeInTheDocument());
    expect(screen.getByRole('link', { name: 'Ir para o site' })).toHaveAttribute(
      'href',
      '/lavacar-beloauto',
    );
    expect(screen.getByRole('link', { name: /Criar conta/ })).toHaveAttribute(
      'href',
      '/lavacar-beloauto/login',
    );
  });

  it('falls back to "/" and omits the login link on the success screen when tenantSlug is absent', async () => {
    vi.mocked(submitGuestBookingInfo).mockResolvedValue({
      bookingId: BOOKING_ID,
      status: 'PENDING',
      infoSubmittedAt: '2026-06-17T14:30:00.000Z',
    });
    const user = userEvent.setup();
    renderWithIntl(<SubmitInfoForm bookingId={BOOKING_ID} token={TOKEN} summary={summary} />);

    await user.type(screen.getByLabelText(/Sua resposta/), 'Segue a foto do veículo.');
    await user.click(screen.getByRole('button', { name: 'Enviar resposta' }));

    await waitFor(() => expect(screen.getByText('Resposta enviada!')).toBeInTheDocument());
    expect(screen.getByRole('link', { name: 'Ir para o site' })).toHaveAttribute('href', '/');
    expect(screen.queryByRole('link', { name: /Criar conta/ })).not.toBeInTheDocument();
  });

  it('shows a retry alert and preserves the response value on a network error', async () => {
    vi.mocked(submitGuestBookingInfo).mockRejectedValue(
      new SubmitGuestBookingInfoError(500, 'network error'),
    );
    const user = userEvent.setup();
    renderWithIntl(<SubmitInfoForm bookingId={BOOKING_ID} token={TOKEN} summary={null} />);

    await user.type(screen.getByLabelText(/Sua resposta/), 'Minha resposta preservada');
    await user.click(screen.getByRole('button', { name: 'Enviar resposta' }));

    await waitFor(() => expect(screen.getByText('Falha ao enviar')).toBeInTheDocument());
    expect(screen.getByLabelText(/Sua resposta/)).toHaveValue('Minha resposta preservada');
    expect(screen.getByRole('button', { name: 'Enviar resposta' })).toBeInTheDocument();
  });

  it('shows the token-expired variant and a link back to the invalid-link state on a 401', async () => {
    vi.mocked(submitGuestBookingInfo).mockRejectedValue(
      new SubmitGuestBookingInfoError(401, 'expired'),
    );
    const user = userEvent.setup();
    renderWithIntl(<SubmitInfoForm bookingId={BOOKING_ID} token={TOKEN} summary={null} />);

    await user.type(screen.getByLabelText(/Sua resposta/), 'texto');
    await user.click(screen.getByRole('button', { name: 'Enviar resposta' }));

    await waitFor(() =>
      expect(
        screen.getByText(/Seu link expirou enquanto você preenchia o formulário/),
      ).toBeInTheDocument(),
    );
    expect(screen.queryByRole('button', { name: 'Enviar resposta' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Voltar' })).toBeInTheDocument();
  });

  it('disables the submit button and shows a loading label while submitting', async () => {
    let resolveSubmit!: (value: {
      bookingId: string;
      status: string;
      infoSubmittedAt: string;
    }) => void;
    vi.mocked(submitGuestBookingInfo).mockReturnValue(
      new Promise((resolve) => {
        resolveSubmit = resolve;
      }),
    );
    const user = userEvent.setup();
    renderWithIntl(<SubmitInfoForm bookingId={BOOKING_ID} token={TOKEN} summary={null} />);

    await user.type(screen.getByLabelText(/Sua resposta/), 'texto');
    await user.click(screen.getByRole('button', { name: 'Enviar resposta' }));

    expect(screen.getByRole('button', { name: 'Enviando…' })).toBeDisabled();

    resolveSubmit({
      bookingId: BOOKING_ID,
      status: 'PENDING',
      infoSubmittedAt: '2026-06-17T14:30:00.000Z',
    });
    await waitFor(() => expect(screen.getByText('Resposta enviada!')).toBeInTheDocument());
  });

  it('renders with tenant branding applied and without crashing when branding is absent', () => {
    const { unmount } = renderWithIntl(
      <SubmitInfoForm
        bookingId={BOOKING_ID}
        token={TOKEN}
        summary={null}
        brandName="BeloAuto"
        brandingStyle={{ '--ba-primary': '#ff0000' } as React.CSSProperties}
      />,
    );
    expect(screen.getByText('BeloAuto')).toBeInTheDocument();
    unmount();

    renderWithIntl(<SubmitInfoForm bookingId={BOOKING_ID} token={TOKEN} summary={null} />);
    expect(screen.getByLabelText(/Sua resposta/)).toBeInTheDocument();
  });

  it('uploads a photo via the guest-token PhotoUpload and includes it in the submit call', async () => {
    vi.mocked(createGuestAttachmentSignedUrl).mockResolvedValue({
      signedUrl: 'https://storage.example.com/upload?sig=abc',
      filePath: `tenants/tenant-1/bookings/${BOOKING_ID}/photo.jpg`,
      expiresAt: '2026-06-15T12:00:00.000Z',
    });
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(null, { status: 200 }));
    vi.mocked(submitGuestBookingInfo).mockResolvedValue({
      bookingId: BOOKING_ID,
      status: 'PENDING',
      infoSubmittedAt: '2026-06-17T14:30:00.000Z',
    });
    const user = userEvent.setup();
    renderWithIntl(<SubmitInfoForm bookingId={BOOKING_ID} token={TOKEN} summary={null} />);

    await user.upload(
      screen.getByLabelText('Fotos do veículo (opcional)'),
      makeFile('photo.jpg', 'image/jpeg'),
    );
    await screen.findByText('Enviada');

    expect(createGuestAttachmentSignedUrl).toHaveBeenCalledWith(
      TOKEN,
      BOOKING_ID,
      'photo.jpg',
      'image/jpeg',
    );

    await user.type(screen.getByLabelText(/Sua resposta/), 'Segue a foto solicitada.');
    await user.click(screen.getByRole('button', { name: 'Enviar resposta' }));

    await waitFor(() => expect(screen.getByText('Resposta enviada!')).toBeInTheDocument());
    expect(submitGuestBookingInfo).toHaveBeenCalledWith(BOOKING_ID, TOKEN, {
      response: 'Segue a foto solicitada.',
      photoUrls: [`tenants/tenant-1/bookings/${BOOKING_ID}/photo.jpg`],
    });

    fetchSpy.mockRestore();
  });
});
