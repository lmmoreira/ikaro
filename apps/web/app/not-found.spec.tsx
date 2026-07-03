// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { generateMetadata, default as NotFoundPage } from './not-found';

vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(),
}));

vi.mock('@/features/platform/hotsite/seo', () => ({
  SITE_URL: 'https://example.com',
}));

import { getTranslations } from 'next-intl/server';

describe('Hotsite not found page', () => {
  beforeEach(() => {
    vi.mocked(getTranslations).mockResolvedValue(
      ((key: string) =>
        ({
          title: 'Não encontrado — Ikaro',
          tenantNotFound: 'Tenant não encontrado',
          tenantNotFoundDescription: 'O tenant que você está procurando não existe ou foi removido.',
          backToHome: 'Voltar para o Ikaro',
        })[key] ?? key) as Awaited<ReturnType<typeof getTranslations>>,
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('generates the translated metadata title', async () => {
    await expect(generateMetadata()).resolves.toEqual({ title: 'Não encontrado — Ikaro' });
  });

  it('renders the not found copy and home link', async () => {
    const element = await NotFoundPage();
    render(element);

    expect(screen.getByRole('heading', { name: 'Tenant não encontrado' })).toBeInTheDocument();
    expect(screen.getByText('O tenant que você está procurando não existe ou foi removido.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Voltar para o Ikaro' })).toHaveAttribute(
      'href',
      'https://example.com',
    );
  });
});
