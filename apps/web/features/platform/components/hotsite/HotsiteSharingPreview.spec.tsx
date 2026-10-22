// @vitest-environment jsdom
import { screen, waitFor } from '@testing-library/react';
import { axe } from 'jest-axe';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { HotsiteManifestResponse, HotsiteSeoResponse } from '@ikaro/types';
import { clearPublicEnv, renderWithIntl, stubPublicEnv } from '@/test-utils';
import { fetchManifestClient } from '@/features/platform/api';
import { generateHotsiteImageReadSignedUrl } from '@/features/platform/api/tenant-settings';
import { HotsiteSharingPreview } from './HotsiteSharingPreview';

vi.mock('@/features/platform/api', () => ({ fetchManifestClient: vi.fn() }));
vi.mock('@/features/platform/api/tenant-settings', () => ({
  generateHotsiteImageReadSignedUrl: vi.fn(),
}));

const mockFetchManifest = vi.mocked(fetchManifestClient);
const mockReadSignedUrl = vi.mocked(generateHotsiteImageReadSignedUrl);

const IMAGE_BASE_URL = 'http://localhost:4443/ikaro-local-public';
const ADDRESS = {
  street: 'Rua A',
  number: '1',
  city: 'Belo Horizonte',
  state: 'MG',
  zipCode: '30000-000',
};

// Only the fields the sharing simulation reads from the public manifest.
function manifestFor(language: string, address: typeof ADDRESS | null): HotsiteManifestResponse {
  return {
    tenant: { id: 'tenant-a-id', name: 'Lavacar', slug: 'tenant-a' },
    business: { phone: null, email: null, address, socialLinks: null },
    localization: { language },
  } as unknown as HotsiteManifestResponse;
}

function seo(overrides: Partial<HotsiteSeoResponse> = {}): HotsiteSeoResponse {
  return { title: null, description: null, ogImageUrl: '', ...overrides };
}

function renderPreview(value: HotsiteSeoResponse) {
  return renderWithIntl(<HotsiteSharingPreview seo={value} tenantSlug="tenant-a" />);
}

describe('HotsiteSharingPreview', () => {
  beforeEach(() => {
    mockFetchManifest.mockReset();
    mockReadSignedUrl.mockReset();
    mockFetchManifest.mockResolvedValue(manifestFor('pt-BR', ADDRESS));
    stubPublicEnv({
      NEXT_PUBLIC_SITE_URL: 'https://ikaro.app/',
      NEXT_PUBLIC_HOTSITE_IMAGE_BASE_URL: IMAGE_BASE_URL,
    });
  });

  afterEach(() => {
    clearPublicEnv();
  });

  it('labels both cards as simulations and never promises an identical rendering', () => {
    renderPreview(seo({ title: 'T', description: 'D' }));

    expect(
      screen.getByRole('heading', { name: 'Prévia de busca e compartilhamento' }),
    ).toBeVisible();
    expect(screen.getByTestId('visual-sharing-disclaimer')).toHaveTextContent(
      'Simulação aproximada. Google, WhatsApp e outros canais podem exibir o resultado de forma diferente.',
    );
    expect(screen.getByRole('heading', { name: 'Resultado no Google' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Cartão no WhatsApp' })).toBeVisible();
  });

  it('shows the set title and description in both cards', () => {
    renderPreview(seo({ title: 'Meu título', description: 'Minha descrição' }));

    expect(screen.getByTestId('visual-sharing-google-title')).toHaveTextContent('Meu título');
    expect(screen.getByTestId('visual-sharing-whatsapp-title')).toHaveTextContent('Meu título');
    expect(screen.getByTestId('visual-sharing-google-description')).toHaveTextContent(
      'Minha descrição',
    );
    expect(screen.getByTestId('visual-sharing-whatsapp-description')).toHaveTextContent(
      'Minha descrição',
    );
  });

  it('updates both cards as the draft changes', () => {
    const { rerender } = renderPreview(seo({ title: 'Antes', description: 'Desc' }));

    rerender(
      <HotsiteSharingPreview
        seo={seo({ title: 'Depois', description: 'Desc' })}
        tenantSlug="tenant-a"
      />,
    );

    expect(screen.getByTestId('visual-sharing-google-title')).toHaveTextContent('Depois');
    expect(screen.getByTestId('visual-sharing-whatsapp-title')).toHaveTextContent('Depois');
  });

  // The public <head> builds its fallback in the tenant's language, whatever language the manager
  // is using — the simulation must show what the public site will really emit (UI locale: pt-BR).
  it.each([
    [
      'pt-BR',
      ADDRESS,
      'Lavacar — Agendamento Online em Belo Horizonte, MG',
      'Agende seu serviço na Lavacar, em Belo Horizonte, MG. Rápido, fácil e online.',
    ],
    [
      'pt-BR',
      null,
      'Lavacar — Agendamento Online',
      'Agende seu serviço na Lavacar. Rápido, fácil e online.',
    ],
    [
      'en',
      ADDRESS,
      'Lavacar — Online Booking in Belo Horizonte, MG',
      'Book your service at Lavacar, in Belo Horizonte, MG. Quick, easy, and online.',
    ],
    [
      'en',
      null,
      'Lavacar — Online Booking',
      'Book your service at Lavacar. Quick, easy, and online.',
    ],
  ] as const)(
    'falls back to the tenant-language (%s, address %o) defaults while title and description are unset',
    async (language, address, title, description) => {
      mockFetchManifest.mockResolvedValue(manifestFor(language, address));

      renderPreview(seo());

      await waitFor(() =>
        expect(screen.getByTestId('visual-sharing-google-title')).toHaveTextContent(title),
      );
      expect(screen.getByTestId('visual-sharing-whatsapp-title')).toHaveTextContent(title);
      expect(screen.getByTestId('visual-sharing-google-description')).toHaveTextContent(
        description,
      );
      expect(screen.getByTestId('visual-sharing-whatsapp-description')).toHaveTextContent(
        description,
      );
    },
  );

  it('mixes a set title with the default description', async () => {
    renderPreview(seo({ title: 'Só o título' }));

    await waitFor(() =>
      expect(screen.getByTestId('visual-sharing-google-description')).toHaveTextContent(
        'Agende seu serviço na Lavacar, em Belo Horizonte, MG.',
      ),
    );
    expect(screen.getByTestId('visual-sharing-google-title')).toHaveTextContent('Só o título');
  });

  it('says the automatic text is loading until the manifest arrives', async () => {
    renderPreview(seo());

    expect(screen.getByTestId('visual-sharing-google-title')).toHaveTextContent(
      'Carregando o texto automático…',
    );
    await waitFor(() =>
      expect(screen.getByTestId('visual-sharing-google-title')).toHaveTextContent('Lavacar'),
    );
  });

  it('says so, instead of inventing a default, when the manifest cannot be loaded', async () => {
    mockFetchManifest.mockRejectedValue(new Error('boom'));

    renderPreview(seo({ title: 'Meu título' }));

    expect(await screen.findByTestId('visual-sharing-google-description')).toHaveTextContent(
      'Não foi possível carregar o texto automático.',
    );
    expect(screen.getByTestId('visual-sharing-google-title')).toHaveTextContent('Meu título');
  });

  it('shows the public URL from the client-safe site origin and the tenant slug', () => {
    renderPreview(seo({ title: 'T', description: 'D' }));

    expect(screen.getByTestId('visual-sharing-google')).toHaveTextContent(
      'https://ikaro.app/tenant-a',
    );
    expect(screen.getByTestId('visual-sharing-whatsapp')).toHaveTextContent('ikaro.app');
  });

  it('shows a neutral placeholder, never the logo, when no sharing image is set', () => {
    renderPreview(seo({ title: 'T', description: 'D' }));

    expect(screen.getByTestId('visual-sharing-no-image')).toHaveTextContent(
      'Sem imagem de compartilhamento',
    );
    expect(screen.queryByTestId('visual-sharing-image')).not.toBeInTheDocument();
  });

  it.each([
    ['an absolute URL', 'https://cdn.example.com/og.png', 'https://cdn.example.com/og.png'],
    [
      'a raw storage path',
      'tenants/t1/hotsite/seo-og-image/a/og.png',
      `${IMAGE_BASE_URL}/tenants/t1/hotsite/seo-og-image/a/og.png`,
    ],
  ])('renders the sharing image from %s', (_label, ogImageUrl, expectedSrc) => {
    renderPreview(seo({ title: 'T', description: 'D', ogImageUrl }));

    expect(screen.getByTestId('visual-sharing-image')).toHaveAttribute('src', expectedSrc);
    expect(screen.getByTestId('visual-sharing-image')).toHaveAttribute(
      'alt',
      'Imagem de compartilhamento',
    );
    expect(screen.queryByTestId('visual-sharing-no-image')).not.toBeInTheDocument();
  });

  it('resolves a just-uploaded tmp/ image through a signed read URL', async () => {
    const tmpPath = 'tmp/tenant-a-id/seo-og-image/u1/og.png';
    mockReadSignedUrl.mockResolvedValue({
      signedUrl: 'https://storage.example.com/signed?sig=og',
      expiresAt: '2026-06-15T12:00:00.000Z',
    });

    renderPreview(seo({ title: 'T', description: 'D', ogImageUrl: tmpPath }));

    expect(screen.getByTestId('visual-sharing-no-image')).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByTestId('visual-sharing-image')).toHaveAttribute(
        'src',
        'https://storage.example.com/signed?sig=og',
      ),
    );
    expect(mockReadSignedUrl).toHaveBeenCalledWith(tmpPath);
  });

  it('has no axe violations', async () => {
    const { container } = renderPreview(seo({ title: 'T', description: 'D' }));

    expect(await axe(container)).toHaveNoViolations();
  });
});
